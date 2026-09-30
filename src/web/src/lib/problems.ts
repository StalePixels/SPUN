// Tests check the code (data-error on the alert), never the wording.

export type ProblemCode =
  | "username.invalidCharacters"
  | "username.length"
  | "username.fixed"
  | "username.taken"
  | "version.invalidCharacters"
  | "version.length"
  | "version.taken"
  | "title.invalidCharacters"
  | "title.length"
  | "description.invalidCharacters"
  | "description.length"
  | "changelog.invalidCharacters"
  | "changelog.length"
  | "category.invalidCharacters"
  | "category.length"
  | "category.reserved"
  | "category.taken"
  | "category.missing"
  | "releaseDate.invalid"
  | "releaseDate.future"
  | "file.missing"
  | "file.tooLarge"
  | "file.notZip"
  | "file.incompatible"
  | "screenshot.missing"
  | "screenshot.tooLarge"
  | "screenshot.notImage"
  | "screenshot.badNxi"
  | "app.notFound"
  | "app.limitReached"
  | "app.releasesFull"
  | "limit.notNumber"
  | "limit.missing"
  | "user.notFound"
  | "admin.lastAdmin";

export type Problem = {
  code: ProblemCode;
  chars?: string[];
  min?: number;
  max?: number;
  limit?: number | null;
};
