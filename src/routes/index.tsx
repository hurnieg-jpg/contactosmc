import { createFileRoute } from "@tanstack/react-router";
import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ApiKeysTab } from "@/components/ApiKeysTab";
import { FilesTab } from "@/components/FilesTab";
import { ProcessTab } from "@/components/ProcessTab";
import { ResultsTab } from "@/components/ResultsTab";
import { ExportTab } from "@/components/ExportTab";
import { ReviewModal } from "@/components/ReviewModal";
import { loadApiKeys, saveApiKeys, type Contact } from "@/lib/contact-engine";
import { type CachedFile } from "@/lib/file-cache";
import { Badge } from "@/components/ui/badge";
import { Key, FolderOpen, Zap, Users, Download } from "lucide-react";

export const Route = createFileRoute("/")({
  component: ContactUnifier,
  head: () => ({
    meta: [
      { title: "ContactUnifier AI Pro – Multi-IA Transparente" },
      { name: "description", content: "Unifica, limpia y deduplica contactos con consenso multi-IA" },
    ],
  }),
});

function ContactUnifier() {
  const [apiKeys, setApiKeys] = useState<Record<string, string[]>>({});
  const [initialized, setInitialized] = useState(false);

  // Load API keys after hydration to avoid SSR mismatch
  if (typeof window !== 'undefined' && !initialized) {
    const saved = loadApiKeys();
    if (Object.keys(saved).length > 0) {
      setApiKeys(saved);
    }
    setInitialized(true);
  }
  const [files, setFiles] = useState<CachedFile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [lowConfidence, setLowConfidence] = useState<Contact[]>([]);
  const [showReview, setShowReview] = useState(false);

  const handleApiKeysChange = useCallback((keys: Record<string, string[]>) => {
    setApiKeys(keys);
    saveApiKeys(keys);
  }, []);

  const handleComplete = useCallback((c: Contact[], lc: Contact[]) => {
    setContacts(c);
    setLowConfidence(lc);
    if (lc.length > 0) setShowReview(true);
  }, []);

  const handleClear = useCallback(() => {
    setFiles([]);
    setContacts([]);
    setLowConfidence([]);
  }, []);

  const handleReviewSave = useCallback((accepted: Contact[]) => {
    setContacts(prev => [...prev, ...accepted]);
    setLowConfidence([]);
    setShowReview(false);
  }, []);

  const totalKeys = Object.values(apiKeys).reduce((s, arr) => s + arr.length, 0);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        <header className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl font-bold text-foreground tracking-tight">
              🤖 ContactUnifier AI Pro
            </h1>
            <Badge className="bg-primary text-primary-foreground text-xs">v16</Badge>
          </div>
          <p className="text-muted-foreground">
            Consenso multi-IA con logs detallados · 12+ proveedores · Dedup fuzzy
          </p>
        </header>

        <Tabs defaultValue="apis" className="space-y-6">
          <TabsList className="bg-surface border border-border p-1 h-auto flex-wrap">
            <TabsTrigger value="apis" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Key className="h-4 w-4" /> APIs
              {totalKeys > 0 && <Badge variant="secondary" className="text-xs ml-1">{totalKeys}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="files" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <FolderOpen className="h-4 w-4" /> Archivos
              {files.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{files.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="process" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Zap className="h-4 w-4" /> Procesar
            </TabsTrigger>
            <TabsTrigger value="results" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Users className="h-4 w-4" /> Resultados
              {contacts.length > 0 && <Badge variant="secondary" className="text-xs ml-1">{contacts.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="export" className="gap-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <Download className="h-4 w-4" /> Exportar
            </TabsTrigger>
          </TabsList>

          <TabsContent value="apis">
            <ApiKeysTab apiKeys={apiKeys} onChange={handleApiKeysChange} />
          </TabsContent>
          <TabsContent value="files">
            <FilesTab files={files} onFilesChange={setFiles} />
          </TabsContent>
          <TabsContent value="process">
            <ProcessTab files={files} apiKeys={apiKeys} onComplete={handleComplete} onClear={handleClear} />
          </TabsContent>
          <TabsContent value="results">
            <ResultsTab contacts={contacts} />
          </TabsContent>
          <TabsContent value="export">
            <ExportTab contacts={contacts} />
          </TabsContent>
        </Tabs>
      </div>

      <ReviewModal
        open={showReview}
        contacts={lowConfidence}
        onSave={handleReviewSave}
        onCancel={() => setShowReview(false)}
      />
    </div>
  );
}
