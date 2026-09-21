export interface Answer {
  id: string;
  text: string;
  isCorrect: boolean;
}
export type Difficulty = "beginner" | "medium" | "pro" | "general";
export type StudyMode = "mixed" | "beginner" | "medium" | "pro";
export interface Question {
  id: string;
  question: string;
  answers: Answer[];
  explanation: string;
  category: string;
  difficulty: Difficulty;
  tags: string[];
  order: number;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  revision?: string;
}
export interface Attempt {
  answerId: string;
  explanationOpen: boolean;
  revision: string;
}
export interface StorageAdapter {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
export interface QuestionStore {
  list(): Question[];
  save(question: Question): unknown | Promise<unknown>;
  version?: string;
  delete(id: string, expectedRevision?: string): unknown | Promise<unknown>;
  duplicate(id: string, draft?: Question): unknown | Promise<unknown>;
  move(
    id: string,
    direction: number,
    mode?: StudyMode | "general",
  ): unknown | Promise<unknown>;
  import(
    questions: Question[],
    mode: "append" | "replace",
    expectedVersion?: string,
  ): unknown | Promise<unknown>;
  export(): string;
}
export interface AppConfig {
  mode: "shared" | "local";
  supabaseUrl: string;
  supabaseKey: string;
  basePath: string;
  hashRouting: boolean;
}
declare global {
  const __APP_CONFIG__: AppConfig;
}
