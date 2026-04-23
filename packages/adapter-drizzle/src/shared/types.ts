// Generic interface that any holeauth "users table" must expose.
// Caller passes their own table definition; we only rely on `id` column
// for foreign keys and `$inferSelect` for typing.
export type AnyUsersTable = {
  id: { name: string } & object;
  $inferSelect: { id: unknown };
};

export type UserIdOf<T extends AnyUsersTable> = T['$inferSelect']['id'];
