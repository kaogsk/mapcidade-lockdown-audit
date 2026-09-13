import type { Db, Row } from "../src/rules/base.js";

/** Fake Db for unit tests: maps SQL -> rows (or an error) via matchers. */
export type Reply = Row[] | { throw: string };

export interface Matcher {
  when: (sql: string) => boolean;
  reply: Reply;
}

export class FakeDb implements Db {
  readonly calls: { city: string; sql: string }[] = [];
  constructor(private readonly matchers: Matcher[] = []) {}

  execute(city: string, sql: string): Promise<Row[]> {
    this.calls.push({ city, sql });
    for (const m of this.matchers) {
      if (m.when(sql)) {
        if (Array.isArray(m.reply)) return Promise.resolve(m.reply);
        return Promise.reject(new Error(m.reply.throw));
      }
    }
    return Promise.resolve([]);
  }
}

/** Fake that always returns the same rows, regardless of query. */
export class ConstDb implements Db {
  constructor(private readonly rows: Row[]) {}
  execute(): Promise<Row[]> {
    return Promise.resolve(this.rows);
  }
}

/** Fake that always throws — exercises SKIP paths. */
export class ThrowingDb implements Db {
  constructor(private readonly message = "boom") {}
  execute(): Promise<Row[]> {
    return Promise.reject(new Error(this.message));
  }
}

export const includes =
  (needle: string) =>
  (sql: string): boolean =>
    sql.includes(needle);
