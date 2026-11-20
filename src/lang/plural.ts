/** n with its noun, for languages that have one form for 1 and one for the rest */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
