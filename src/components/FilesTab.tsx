import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, FileText, Upload, X } from 'lucide-react';

interface FilesTabProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
}

const VALID_EXTENSIONS = /\.(csv|txt|xlsx|xls|vcf|vcard)$/i;

export function FilesTab({ files, onFilesChange }: FilesTabProps) {
  const [dragOver, setDragOver] = useState(false);
  const folderRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((fileList: FileList) => {
    const valid = Array.from(fileList).filter(f => VALID_EXTENSIONS.test(f.name));
    if (valid.length) onFilesChange([...files, ...valid]);
  }, [files, onFilesChange]);

  const removeFile = (idx: number) => {
    onFilesChange(files.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6">
      <div
        className={`border-2 border-dashed rounded-2xl p-12 text-center transition-all cursor-pointer
          ${dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'}`}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
        onClick={() => filesRef.current?.click()}
      >
        <Upload className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Arrastrá carpeta o archivos
        </h3>
        <p className="text-sm text-muted-foreground mb-6">CSV, Excel, VCF, TXT</p>
        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={e => { e.stopPropagation(); folderRef.current?.click(); }}>
            <FolderOpen className="h-4 w-4 mr-2" /> Seleccionar carpeta
          </Button>
          <Button variant="outline" onClick={e => { e.stopPropagation(); filesRef.current?.click(); }}>
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

      {files.length > 0 && (
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
      )}
    </div>
  );
}
