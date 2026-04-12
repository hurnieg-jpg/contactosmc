import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, FileText, Upload, X, AlertCircle } from 'lucide-react';
import { type CachedFile, cacheFiles } from '@/lib/file-cache';

interface FilesTabProps {
  files: CachedFile[];
  onFilesChange: (files: CachedFile[]) => void;
}

const VALID_EXTENSIONS = /\.(csv|txt|xlsx|xls|vcf|vcard)$/i;

export function FilesTab({ files, onFilesChange }: FilesTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [skipped, setSkipped] = useState<string[]>([]);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback(async (fileList: FileList) => {
    const allFiles = Array.from(fileList);
    const valid = allFiles.filter(f => VALID_EXTENSIONS.test(f.name));
    const skippedNames = allFiles.filter(f => !VALID_EXTENSIONS.test(f.name)).map(f => f.name);
    setSkipped(skippedNames.length > 10 ? [...skippedNames.slice(0, 10), `...y ${skippedNames.length - 10} más`] : skippedNames);

    if (!valid.length) return;
    setLoading(true);
    setLoadingMsg(`Cargando ${valid.length} archivos en memoria...`);

    try {
      // Process in batches of 20 for better UX
      const batchSize = 20;
      const allCached: CachedFile[] = [];
      for (let i = 0; i < valid.length; i += batchSize) {
        const batch = valid.slice(i, i + batchSize);
        setLoadingMsg(`Cargando archivos ${i + 1}-${Math.min(i + batchSize, valid.length)} de ${valid.length}...`);
        const cached = await cacheFiles(batch);
        allCached.push(...cached);
      }
      // Deduplicate by name - keep the newest version
      const existingNames = new Set(files.map(f => f.name));
      const newFiles = allCached.filter(f => !existingNames.has(f.name));
      const dupeCount = allCached.length - newFiles.length;
      if (dupeCount > 0) {
        setLoadingMsg(`${dupeCount} archivo(s) duplicado(s) omitidos`);
      }
      onFilesChange([...files, ...newFiles]);
    } finally {
      setLoading(false);
      setTimeout(() => setLoadingMsg(''), 3000);
    }
  }, [files, onFilesChange]);

  const removeFile = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  // Collect all files from drag, including directory entries
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    // Try using DataTransferItem.webkitGetAsEntry for directory support
    const items = e.dataTransfer.items;
    if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
      const allFiles: File[] = [];
      const entries: FileSystemEntry[] = [];

      for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry();
        if (entry) entries.push(entry);
      }

      const readEntry = (entry: FileSystemEntry): Promise<File[]> => {
        return new Promise((resolve) => {
          if (entry.isFile) {
            (entry as FileSystemFileEntry).file(
              f => resolve([f]),
              () => resolve([])
            );
          } else if (entry.isDirectory) {
            const reader = (entry as FileSystemDirectoryEntry).createReader();
            const readBatch = (): Promise<File[]> => {
              return new Promise((batchResolve) => {
                reader.readEntries(async (results) => {
                  if (results.length === 0) {
                    batchResolve([]);
                    return;
                  }
                  const filesFromEntries: File[] = [];
                  for (const r of results) {
                    const f = await readEntry(r);
                    filesFromEntries.push(...f);
                  }
                  const moreFiles = await readBatch();
                  batchResolve([...filesFromEntries, ...moreFiles]);
                }, () => batchResolve([]));
              });
            };
            readBatch().then(resolve);
          } else {
            resolve([]);
          }
        });
      };

      for (const entry of entries) {
        const filesFromEntry = await readEntry(entry);
        allFiles.push(...filesFromEntry);
      }

      if (allFiles.length > 0) {
        const dt = new DataTransfer();
        allFiles.forEach(f => dt.items.add(f));
        await addFiles(dt.files);
        return;
      }
    }

    // Fallback to normal file handling
    await addFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => filesRef.current?.click()}
      >
        <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          {loading ? loadingMsg : 'Arrastrá carpeta o archivos'}
        </h3>
        <p className="text-sm text-muted-foreground mb-6">CSV, Excel, VCF, TXT · También arrastrá carpetas completas</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" disabled={loading} onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}>
            <FolderOpen className="h-4 w-4 mr-2" /> Seleccionar carpeta
          </Button>
          <Button variant="outline" disabled={loading} onClick={e => { e.stopPropagation(); filesRef.current?.click(); }}>
            <FileText className="h-4 w-4 mr-2" /> Seleccionar archivos
          </Button>
        </div>
      </div>

      <input ref={folderRef} type="file" className="hidden" multiple
        {...({ webkitdirectory: "true" } as any)}
        onChange={e => e.target.files && addFiles(e.target.files)} />
      <input ref={filesRef} type="file" className="hidden" multiple
        accept=".csv,.txt,.xlsx,.xls,.vcf,.vcard"
        onChange={e => e.target.files && addFiles(e.target.files)} />

      {skipped.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>
            <strong>Archivos omitidos</strong> (formato no soportado):
            <span className="ml-1">{skipped.join(', ')}</span>
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div>
          <p className="text-sm text-muted-foreground mb-2">{files.length} archivo(s) cargados en memoria</p>
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) => (
              <Badge key={i} variant="secondary" className="gap-2 py-1.5 px-3 text-sm">
                <FileText className="h-3.5 w-3.5" />
                {f.name}
                <button onClick={() => removeFile(i)} className="opacity-60 hover:opacity-100">
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
