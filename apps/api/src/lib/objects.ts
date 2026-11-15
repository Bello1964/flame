type RequiredKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? never : K }[keyof T];
type OptionalKeys<T> = Exclude<keyof T, RequiredKeys<T>>;

/** T with required keys unchanged and optional keys no longer accepting an explicit undefined. */
export type Defined<T> = { [K in RequiredKeys<T>]: T[K] } & {
  [K in OptionalKeys<T>]?: Exclude<T[K], undefined>;
};

/** Drops undefined-valued keys so partial updates only touch provided fields (null is kept). */
export function definedOnly<T extends object>(input: T): Defined<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as Defined<T>;
}
