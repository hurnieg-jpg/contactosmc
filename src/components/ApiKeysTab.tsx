import { useState } from 'react';
import { PROVIDERS } from '@/lib/providers';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Download, Upload, Plus, X, Key } from 'lucide-react';

interface ApiKeysTabProps {
  apiKeys: Record<string, string[]>;
  onChange: (keys: Record<string, string[]>) => void;
}

export function ApiKeysTab({ apiKeys, onChange }: ApiKeysTabProps) {
  const [inputValues, setInputValues] = useState<Record<string, string>>({});

  const addKey = (providerId: string) => {
    const key = inputValues[providerId]?.trim();
    if (!key) return;
    const updated = { ...apiKeys, [providerId]: [...(apiKeys[providerId] || []), key] };
    onChange(updated);
    setInputValues(prev => ({ ...prev, [providerId]: '' }));
  };

  const removeKey = (providerId: string, idx: number) => {
    const updated = { ...apiKeys };
    updated[providerId] = [...(updated[providerId] || [])];
    updated[providerId].splice(idx, 1);
    onChange(updated);
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(apiKeys, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'config.json';
    a.click();
  };

  const importConfig = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const parsed = JSON.parse(ev.target!.result as string);
          onChange(parsed);
        } catch { /* ignore */ }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const totalKeys = Object.values(apiKeys).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <Key className="h-5 w-5 text-primary" />
            Proveedores IA
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {totalKeys} clave(s) configurada(s) · Cuantas más claves, mayor consenso y precisión.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={importConfig}>
            <Download className="h-4 w-4 mr-1" /> Importar
          </Button>
          <Button variant="outline" size="sm" onClick={exportConfig}>
            <Upload className="h-4 w-4 mr-1" /> Exportar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {Object.entries(PROVIDERS).map(([id, p]) => {
          const keys = apiKeys[id] || [];
          return (
            <Card key={id} className="bg-surface border-border">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <span className="text-lg">{p.emoji}</span>
                    {p.name}
                  </CardTitle>
                  {keys.length > 0 && (
                    <Badge variant="secondary" className="text-xs">{keys.length}</Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Input
                    type="password"
                    placeholder="API Key..."
                    value={inputValues[id] || ''}
                    onChange={e => setInputValues(prev => ({ ...prev, [id]: e.target.value }))}
                    onKeyDown={e => e.key === 'Enter' && addKey(id)}
                    className="text-xs bg-background"
                  />
                  <Button size="icon" variant="secondary" onClick={() => addKey(id)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {keys.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {keys.map((k, i) => (
                      <Badge key={i} variant="outline" className="text-xs gap-1 font-mono">
                        {k.slice(0, 5)}•••{k.slice(-3)}
                        <button onClick={() => removeKey(id, i)} className="ml-1 opacity-60 hover:opacity-100">
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
