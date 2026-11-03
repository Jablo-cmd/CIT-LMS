type PersistPrivateObjectOptions<T> = {
  save: () => Promise<void>;
  commit: () => Promise<T>;
  rollback: () => Promise<void>;
  removeNew: () => Promise<void>;
  removePrevious?: () => Promise<void>;
};

export async function persistPrivateObject<T>(options: PersistPrivateObjectOptions<T>): Promise<T> {
  let result: T;
  try {
    await options.save();
    result = await options.commit();
  } catch (error) {
    await options.rollback().catch(() => undefined);
    await options.removeNew().catch(() => undefined);
    throw error;
  }

  if (options.removePrevious) await options.removePrevious().catch(() => undefined);
  return result;
}