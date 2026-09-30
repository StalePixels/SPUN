export interface UserRenameStore {
  dirExists(username: string): Promise<boolean>;
  renameDir(from: string, to: string): Promise<void>;
  updateUsername(userId: string, username: string): Promise<void>;
}

// Directory first, so a failed update leaves the old name and its directory.
export async function renameUser(
  store: UserRenameStore,
  userId: string,
  from: string,
  to: string,
): Promise<void> {
  const moveDir = await store.dirExists(from);
  if (moveDir) {
    await store.renameDir(from, to);
  }
  try {
    await store.updateUsername(userId, to);
  } catch (err) {
    if (moveDir) {
      await store.renameDir(to, from);
    }
    throw err;
  }
}
