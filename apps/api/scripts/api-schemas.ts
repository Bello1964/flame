/**
 * Generates JSON Schemas (OpenAPI 3.1 / JSON Schema 2020-12) for the API's response types
 * from the TypeScript types in @flame/shared, using the TypeScript compiler (a dev
 * dependency; nothing is added). The result is committed as src/docs/schemas.generated.ts,
 * because the production API does not ship the compiler.
 *
 *   npm run docs:schemas -w @flame/api      regenerate after changing a shared type
 *
 * src/docs/openapi.test.ts fails while the committed file is out of date.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export type JsonSchema = Record<string, unknown>;

const SHARED_ENTRY = fileURLToPath(
  new URL('../../../packages/shared/src/index.ts', import.meta.url),
);
const OUTPUT = fileURLToPath(new URL('../src/docs/schemas.generated.ts', import.meta.url));

function documentation(symbol: ts.Symbol, checker: ts.TypeChecker): string | undefined {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  return text === '' ? undefined : text.replace(/\s*\n\s*/g, ' ');
}

/** Schemas for every exported non-generic interface and type alias of @flame/shared. */
export function generateSharedSchemas(): Record<string, JsonSchema> {
  const program = ts.createProgram([SHARED_ENTRY], {
    strict: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
  });
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(SHARED_ENTRY);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) throw new Error(`Cannot read ${SHARED_ENTRY}`);

  // Exported named types, by their declaring symbol.
  const names = new Map<ts.Symbol, string>();
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (!(symbol.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias))) continue;
    const generic = symbol.declarations?.some(
      (d) =>
        (ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)) &&
        (d.typeParameters?.length ?? 0) > 0,
    );
    if (!generic) names.set(symbol, exported.name);
  }

  // Enum-like aliases such as `type Role = (typeof ROLES)[number]` carry no alias symbol;
  // union types are interned, so they are recognised by type identity instead.
  const namesByType = new Map<ts.Type, string>();
  for (const [symbol, name] of names) {
    const declared = checker.getDeclaredTypeOfSymbol(symbol);
    if (declared.isUnion()) namesByType.set(declared, name);
  }

  const refOf = (type: ts.Type): JsonSchema | null => {
    for (const symbol of [type.aliasSymbol, type.getSymbol()]) {
      const name = symbol && names.get(symbol);
      if (name) return { $ref: `#/components/schemas/${name}` };
    }
    const name = namesByType.get(type);
    return name ? { $ref: `#/components/schemas/${name}` } : null;
  };

  /** `root` is converted in full; any named type inside it becomes a reference. */
  const convert = (type: ts.Type, root?: ts.Type): JsonSchema => {
    if (type !== root) {
      const ref = refOf(type);
      if (ref) return ref;
    }
    const f = type.flags;
    if (f & ts.TypeFlags.Boolean) return { type: 'boolean' };
    if (f & ts.TypeFlags.String || f & ts.TypeFlags.TemplateLiteral) return { type: 'string' };
    if (f & ts.TypeFlags.Number) return { type: 'number' };
    if (f & ts.TypeFlags.Null) return { type: 'null' };
    if (type.isStringLiteral()) return { type: 'string', enum: [type.value] };
    if (type.isNumberLiteral()) return { type: 'number', enum: [type.value] };
    if (f & ts.TypeFlags.BooleanLiteral) {
      return { type: 'boolean', enum: [checker.typeToString(type) === 'true'] };
    }
    if (f & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return {};
    if (type.isUnion()) {
      const members = type.types.filter((t) => !(t.flags & ts.TypeFlags.Undefined));
      // A union that contains a named enum (e.g. `Role | null`) is flattened by the
      // compiler, so look for a named union of the string literals.
      const literals = members.filter((t): t is ts.StringLiteralType => t.isStringLiteral());
      const others = members.filter((t) => !t.isStringLiteral());
      const parts: JsonSchema[] = [];
      if (literals.length > 0) {
        const named = [...namesByType].find(
          ([t]) =>
            t !== root &&
            t.isUnion() &&
            t.types.length === literals.length &&
            t.types.every((member) => literals.includes(member as ts.StringLiteralType)),
        );
        parts.push(
          named
            ? { $ref: `#/components/schemas/${named[1]}` }
            : { type: 'string', enum: literals.map((t) => t.value).sort() },
        );
      }
      // `boolean` inside a union appears as `true | false`.
      const booleans = others.filter((t) => t.flags & ts.TypeFlags.BooleanLiteral);
      if (booleans.length === 2) parts.push({ type: 'boolean' });
      else parts.push(...booleans.map((t) => convert(t)));
      const rest = others.filter(
        (t) => !(t.flags & (ts.TypeFlags.BooleanLiteral | ts.TypeFlags.Null)),
      );
      parts.push(...rest.map((t) => convert(t)));
      if (others.some((t) => t.flags & ts.TypeFlags.Null)) parts.push({ type: 'null' });
      return parts.length === 1 ? (parts[0] ?? {}) : { anyOf: parts };
    }
    if (type.isIntersection()) {
      // Each member would carry additionalProperties: false, so allOf could never match.
      throw new Error(`Intersections are not supported yet: ${checker.typeToString(type)}`);
    }
    if (checker.isArrayType(type) || checker.isTupleType(type)) {
      const args = checker.getTypeArguments(type as ts.TypeReference);
      if (checker.isTupleType(type)) {
        return { type: 'array', prefixItems: args.map((t) => convert(t)) };
      }
      return { type: 'array', items: args[0] ? convert(args[0]) : {} };
    }
    if (f & ts.TypeFlags.Object) {
      const properties: Record<string, JsonSchema> = {};
      const required: string[] = [];
      for (const property of checker.getPropertiesOfType(type)) {
        const optional = (property.flags & ts.SymbolFlags.Optional) !== 0;
        const schema = convert(checker.getTypeOfSymbol(property));
        const description = documentation(property, checker);
        properties[property.name] = description ? { ...schema, description } : schema;
        if (!optional) required.push(property.name);
      }
      const schema: JsonSchema = { type: 'object', properties };
      if (required.length > 0) schema['required'] = required;
      const index = checker.getIndexInfosOfType(type)[0];
      schema['additionalProperties'] = index ? convert(index.type) : false;
      return schema;
    }
    throw new Error(`Unsupported type in @flame/shared: ${checker.typeToString(type)}`);
  };

  const schemas: Record<string, JsonSchema> = {};
  for (const [symbol, name] of [...names].sort((a, b) => (a[1] < b[1] ? -1 : 1))) {
    const declared = checker.getDeclaredTypeOfSymbol(symbol);
    const schema = convert(declared, declared);
    const description = documentation(symbol, checker);
    schemas[name] = description ? { ...schema, description } : schema;
  }
  return schemas;
}

/** The generated module's text. */
export function renderSchemasModule(schemas: Record<string, JsonSchema>): string {
  return `// Generated by scripts/api-schemas.ts from @flame/shared. Do not edit by hand:
// run \`npm run docs:schemas -w @flame/api\` after changing a shared type.

export const sharedSchemas: Record<string, Record<string, unknown>> = ${JSON.stringify(schemas, null, 2)};
`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  writeFileSync(OUTPUT, renderSchemasModule(generateSharedSchemas()));
  process.stdout.write(`Wrote ${OUTPUT}\n`);
}
