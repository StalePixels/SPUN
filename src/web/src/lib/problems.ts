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
  | "keyName.invalidCharacters"
  | "keyName.length"
  | "description.invalidCharacters"
  | "description.length"
  | "changelog.invalidCharacters"
  | "changelog.length"
  | "installDir.drive"
  | "installDir.invalidCharacters"
  | "installDir.dots"
  | "installDir.banned"
  | "installDir.length"
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
  | "screenshot.notFound"
  | "app.notFound"
  | "app.limitReached"
  | "app.releasesFull"
  | "release.notFound"
  | "limit.notNumber"
  | "limit.missing"
  | "user.notFound"
  | "admin.lastAdmin"
  | "api.badKey"
  | "api.badSignature"
  | "api.oldRequest"
  | "api.nonceUsed"
  | "api.missingHeader"
  | "api.bodyTooLarge"
  | "api.lengthRequired"
  | "api.tooManyRequests";

export type Problem = {
  code: ProblemCode;
  chars?: string[];
  min?: number;
  max?: number;
  limit?: number | null;
};
