import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { processContacts, type Contact, type LogEntry } from '@/lib/contact-engine';
import { Zap, Pause, Play, StopCircle, Trash2, RotateCcw } from 'lucide-react';

interface ProcessTabProps {
  files: File[];
  apiKeys: Record<string, string[]>;
  onComplete: (contacts: Contact[], lowConfidence: Contact[]) => void;
  onClear: () => void;
}

export function ProcessTab({ files, apiKeys, onComplete, onClear }: ProcessTabProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([{ time: new Date().toLocaleTimeString(), message: '🟢 Sistema listo. Carga APIs y archivos.', type: 'ok' }]);
  const [progress, setProgress] = useState(0);
  const [progressText, setProgressText] = useState('');
  const [livePreview, setLivePreview] = useState<Contact[]>([]);
  const [useAIMapping, setUseAIMapping] = useState(true);
  const [useAICleaning, setUseAICleaning] = useState(true);
  const [minConfidence, setMinConfidence] = useState(0.7);
  const abortRef = useRef<AbortController | null>(null);
  const pausedRef = useRef(false);
  const logBoxRef = useRef<HTMLDivElement>(null);

  const addLog = useCallback((entry: LogEntry) => {
    setLogs(prev => {
      const next = [...prev, entry];
      if (next.length > 150) next.shift();
      return next;
    });
    setTimeout(() => {
      if (logBoxRef.current) logBoxRef.current.scrollTop = logBoxRef.current.scrollHeight;
    }, 50);
  }, []);

  const handleProcess = async () => {
    if (!files.length) return;
    setIsProcessing(true);
    setIsPaused(false);
    pausedRef.current = false;
    abortRef.current = new AbortController();
    setLivePreview([]);
    setProgress(0);

    try {
      const result = await processContacts({
        files,
        apiKeys,
        useAIForMapping: useAIMapping,
        useAIForCleaning: useAICleaning,
        minConfidence,
        signal: abortRef.current.signal,
        onLog: addLog,
        onProgress: (cur, total) => {
          setProgress(Math.round(cur / total * 100));
          setProgressText(`Archivos ${cur}/${total}`);
        },
        onLivePreview: (c) => setLivePreview(prev => [...prev.slice(-14), c]),
        isPaused: () => pausedRef.current,
      });
      onComplete(result.contacts, result.lowConfidence);
      addLog({ time: new Date().toLocaleTimeString(), message: `✅ Procesamiento completado: ${result.contacts.length} contactos`, type: 'ok' });
    } catch (e: any) {
      addLog({ time: new Date().toLocaleTimeString(), message: `❌ ${e.message}`, type: 'err' });
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePause = () => {
    pausedRef.current = !pausedRef.current;
    setIsPaused(pausedRef.current);
  };

  const stop = () => abortRef.current?.abort();

  const logColor = (type: LogEntry['type']) => {
    switch (type) {
      case 'ok': return 'text-log-ok';
      case 'err': return 'text-log-err';
      case 'warn': return 'text-log-warn';
      case 'ai': return 'text-log-ai';
      default: return 'text-log-foreground';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-3">
        <Button onClick={handleProcess} disabled={isProcessing || !files.length}>
          <Zap className="h-4 w-4 mr-2" /> Iniciar procesamiento
        </Button>
        <Button variant="outline" onClick={togglePause} disabled={!isProcessing}>
          {isPaused ? <Play className="h-4 w-4 mr-2" /> : <Pause className="h-4 w-4 mr-2" />}
          {isPaused ? 'Reanudar' : 'Pausar'}
        </Button>
        <Button variant="destructive" onClick={stop} disabled={!isProcessing}>
          <StopCircle className="h-4 w-4 mr-2" /> STOP
        </Button>
        <Button variant="outline" onClick={onClear}>
          <Trash2 className="h-4 w-4 mr-2" /> Limpiar
        </Button>
        <Button variant="outline" onClick={() => { onClear(); setLogs([]); setLivePreview([]); setProgress(0); }}>
          <RotateCcw className="h-4 w-4 mr-2" /> Reset completo
        </Button>
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={useAIMapping} onChange={e => setUseAIMapping(e.target.checked)} className="rounded" />
          IA para mapeo
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={useAICleaning} onChange={e => setUseAICleaning(e.target.checked)} className="rounded" />
          IA para limpieza
        </label>
        <label className="flex items-center gap-2">
          Confianza mín:
          <input type="number" min={0} max={1} step={0.1} value={minConfidence}
            onChange={e => setMinConfidence(parseFloat(e.target.value))}
            className="w-16 rounded-md border border-input bg-background px-2 py-1 text-sm" />
        </label>
      </div>

      {isProcessing && (
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>{progressText || 'Procesando...'}</span>
            <span>{progress}%</span>
          </div>
          <Progress value={progress} />
        </div>
      )}

      <div ref={logBoxRef} className="bg-log-bg rounded-xl p-4 h-52 overflow-y-auto font-mono text-xs space-y-0.5">
        {logs.map((l, i) => (
          <div key={i} className={logColor(l.type)}>
            [{l.time}] {l.message}
          </div>
        ))}
      </div>

      {livePreview.length > 0 && (
        <div className="border border-border rounded-xl overflow-hidden">
          <div className="overflow-auto max-h-48">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface text-muted-foreground text-xs">
                  <th className="px-3 py-2 text-left">Nombre</th>
                  <th className="px-3 py-2 text-left">Apellido</th>
                  <th className="px-3 py-2 text-left">WhatsApp</th>
                  <th className="px-3 py-2 text-left">Email</th>
                  <th className="px-3 py-2 text-left">Conf.</th>
                </tr>
              </thead>
              <tbody>
                {livePreview.map((c, i) => (
                  <tr key={i} className="border-t border-border">
                    <td className="px-3 py-1.5">{c.nombre}</td>
                    <td className="px-3 py-1.5">{c.apellido}</td>
                    <td className="px-3 py-1.5 font-mono text-xs">{c.whatsapp}</td>
                    <td className="px-3 py-1.5 text-xs">{c.email}</td>
                    <td className="px-3 py-1.5">{c.confidence.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
