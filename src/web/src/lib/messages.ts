import type { Problem } from "./problems";
import { MAX_UPLOAD_TEXT } from "./rules";

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
    case "title.invalidCharacters":
      return `The title cannot use: ${characters(problem.chars)}`;
    case "title.length":
      return `The title must be ${min} to ${max} characters.`;
    case "description.invalidCharacters":
      return `The description cannot use: ${characters(problem.chars)}`;
    case "description.length":
      return `The description must be ${max} characters or fewer.`;
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
    case "app.notFound":
      return "App not found.";
    case "app.limitReached":
      return limit === 0
        ? "You cannot publish apps."
        : `You can publish up to ${appLimitText(limit)}.`;
    case "app.releasesFull":
      return `This app has reached the maximum of ${max} releases.`;
    case "limit.notNumber":
      return "Enter a whole number.";
    case "limit.missing":
      return "Enter the number of apps this user can publish.";
    case "user.notFound":
      return "User not found.";
    case "admin.lastAdmin":
      return "This is the only admin. Make another user an admin first.";
  }
}
