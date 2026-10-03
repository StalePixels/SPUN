import type { DotMove } from "./dotcommands";
import type { Problem } from "./problems";
import { INSTALL_DIR_BANNED, MAX_SCREENSHOT_TEXT, MAX_UPLOAD_TEXT } from "./rules";

// Behaviour and tests never depend on this wording.

const CHARACTER_NAMES: Record<string, string> = {
  " ": "space",
  "\t": "tab",
  "\n": "line break",
  "\r": "line break",
};

function characters(chars: string[] = []): string {
  return [...new Set(chars.map((char) => CHARACTER_NAMES[char] ?? char))].join("  ");
}

export function appLimitText(limit: number | null): string {
  if (limit === null) return "no limit";
  if (limit === 0) return "no apps";
  return limit === 1 ? "1 app" : `${limit} apps`;
}

export function dotMoveText(move: DotMove): string {
  return `${move.file} will be moved to ${move.to} on install.`;
}

export function problemMessage(problem: Problem): string {
  const { min, max, limit = null } = problem;
  switch (problem.code) {
    case "username.invalidCharacters":
      return `A username cannot use: ${characters(problem.chars)}`;
    case "username.length":
      return `The username must be ${min} to ${max} characters.`;
    case "username.fixed":
      return "Your username is already set. It cannot be changed.";
    case "username.taken":
      return "That username is taken.";
    case "version.invalidCharacters":
      return `A version cannot use: ${characters(problem.chars)}`;
    case "version.length":
      return `The version must be ${min} to ${max} characters.`;
    case "version.taken":
      return "This app already has a release with this version, or had one that was deleted.";
    case "title.invalidCharacters":
      return `The title cannot use: ${characters(problem.chars)}`;
    case "title.length":
      return `The title must be ${min} to ${max} characters.`;
    case "keyName.invalidCharacters":
      return `The key name cannot use: ${characters(problem.chars)}`;
    case "keyName.length":
      return `The key name must be ${min} to ${max} characters.`;
    case "description.invalidCharacters":
      return `The description cannot use: ${characters(problem.chars)}`;
    case "description.length":
      return `The description must be ${max} characters or fewer.`;
    case "changelog.invalidCharacters":
      return `The changelog cannot use: ${characters(problem.chars)}`;
    case "changelog.length":
      return `The changelog must be ${max} characters or fewer.`;
    case "installDir.drive":
      return "The install directory cannot have a drive letter or a colon.";
    case "installDir.invalidCharacters":
      return `The install directory cannot use: ${characters(problem.chars)}`;
    case "installDir.dots":
      return "The install directory cannot have . or .. in its path.";
    case "installDir.banned":
      return `The install directory cannot be / or be in ${INSTALL_DIR_BANNED.slice(1).join(", ")}.`;
    case "installDir.length":
      return `The install directory must be ${max} characters or fewer.`;
    case "category.invalidCharacters":
      return `A category slug or name cannot use: ${characters(problem.chars)}`;
    case "category.length":
      return `A category slug or name must be ${min} to ${max} characters.`;
    case "category.reserved":
      return "That slug is a page of the site. Choose another.";
    case "category.taken":
      return "Another category has that slug, or had it before it was deleted.";
    case "category.missing":
      return "Choose at least one category.";
    case "releaseDate.invalid":
      return "The release date is not a real date.";
    case "releaseDate.future":
      return "The release date cannot be after the upload date.";
    case "file.missing":
      return "Choose a zip file to upload.";
    case "file.tooLarge":
      return `The file is larger than ${MAX_UPLOAD_TEXT}.`;
    case "file.notZip":
      return "The file is not a readable zip. It can be damaged, cut short, or not a zip.";
    case "file.incompatible":
      return "A Next cannot install this zip.";
    case "file.badNames":
      return `These names in the zip use characters a Next cannot use (only printable ASCII, without " * < > ? |): ${(problem.names ?? []).join(", ")}`;
    case "file.dotCommandTaken":
      return `The zip has dot commands at its root that the Next already has: ${(problem.names ?? []).join(", ")}`;
    case "screenshot.missing":
      return "Choose an image file to upload.";
    case "screenshot.tooLarge":
      return `The image is larger than ${MAX_SCREENSHOT_TEXT}.`;
    case "screenshot.notImage":
      return "The file is not a PNG, JPEG, GIF or WebP image that the CMS can read.";
    case "screenshot.badNxi":
      return "An NXI file must be 49,664 bytes (256×192) or 82,432 bytes (320×256), with its palette first.";
    case "screenshot.notFound":
      return "Screenshot not found.";
    case "app.notFound":
      return "App not found.";
    case "app.limitReached":
      return limit === 0
        ? "You cannot publish apps."
        : `You can publish up to ${appLimitText(limit)}.`;
    case "app.releasesFull":
      return `This app has reached the maximum of ${max} releases.`;
    case "release.notFound":
      return "Release not found.";
    case "limit.notNumber":
      return "Enter a whole number.";
    case "limit.missing":
      return "Enter the number of apps this user can publish.";
    case "user.notFound":
      return "User not found.";
    case "admin.lastAdmin":
      return "This is the only admin. Make another user an admin first.";
    case "api.badKey":
      return "The API key is unknown or deleted, or its user cannot publish.";
    case "api.badSignature":
      return "The signature does not match the request.";
    case "api.oldRequest":
      return "The timestamp is more than 5 minutes from the server's time.";
    case "api.nonceUsed":
      return "This nonce was already used. Make a new one for each request.";
    case "api.missingHeader":
      return "A request needs the headers X-SPUN-Key, X-SPUN-Timestamp, X-SPUN-Nonce and X-SPUN-Signature, each in its form.";
    case "api.bodyTooLarge":
      return `The request body is larger than ${max} bytes.`;
    case "api.lengthRequired":
      return "The request has a body but no Content-Length header.";
    case "api.tooManyRequests":
      return "Too many requests. Wait for the time in the Retry-After header.";
  }
}
