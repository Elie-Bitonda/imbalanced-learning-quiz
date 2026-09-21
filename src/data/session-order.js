/** Fisher–Yates shuffle of a view, never the stored question array.
 * @template T @param {T[]} items @param {() => number} [random] @returns {T[]}
 */
export function shuffle(items, random = Math.random) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Only IDs belong to the session. Content always comes from the current bank. */
export class SessionOrder {
  /** @param {() => number} [random] */
  constructor(random = Math.random) {
    this.random = random;
    /** @type {string[]} */ this.ids = [];
  }
  reset() {
    this.ids = [];
  }

  /** Preserve surviving IDs; append shuffled newcomers without moving existing questions.
   * @param {import('../models').Question[]} questions
   * @returns {import('../models').Question[]}
   */
  resolve(questions) {
    const byId = new Map(questions.map((q) => [q.id, q]));
    this.ids = this.ids.filter((id) => byId.has(id));
    const known = new Set(this.ids);
    this.ids.push(
      ...shuffle(
        [...byId.keys()].filter((id) => !known.has(id)),
        this.random,
      ),
    );
    return this.ids.map(
      (id) => /** @type {import('../models').Question} */ (byId.get(id)),
    );
  }
}
