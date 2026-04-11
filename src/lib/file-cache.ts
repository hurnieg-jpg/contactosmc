export interface CachedFile {
  name: string;
  content: ArrayBuffer;
}

export async function cacheFiles(files: File[]): Promise<CachedFile[]> {
  return Promise.all(
    files.map(async (f) => ({
      name: f.name,
      content: await f.arrayBuffer(),
    }))
  );
}
