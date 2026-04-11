import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { exportCSV, exportVCF, downloadFile, type Contact } from '@/lib/contact-engine';
import { FileSpreadsheet, FileJson, Smartphone, Download } from 'lucide-react';

interface ExportTabProps {
  contacts: Contact[];
}

export function ExportTab({ contacts }: ExportTabProps) {
  const doExportCSV = () => downloadFile(exportCSV(contacts), 'contactos.csv');
  const doExportJSON = () => downloadFile(JSON.stringify(contacts, null, 2), 'contactos.json');
  const doExportVCF = () => downloadFile(exportVCF(contacts), 'contactos.vcf');

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Download className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Nada para exportar</p>
        <p className="text-sm">Procesá contactos primero.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
        <Download className="h-5 w-5 text-primary" />
        Exportar {contacts.length} contactos
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-surface border-border hover:border-primary/40 transition-colors cursor-pointer" onClick={doExportCSV}>
          <CardHeader>
            <FileSpreadsheet className="h-10 w-10 text-success mb-2" />
            <CardTitle className="text-base">CSV</CardTitle>
            <CardDescription>Compatible con Excel, Google Sheets</CardDescription>
          </CardHeader>
          <CardContent>
            <Button className="w-full">Descargar CSV</Button>
          </CardContent>
        </Card>

        <Card className="bg-surface border-border hover:border-primary/40 transition-colors cursor-pointer" onClick={doExportJSON}>
          <CardHeader>
            <FileJson className="h-10 w-10 text-primary mb-2" />
            <CardTitle className="text-base">JSON</CardTitle>
            <CardDescription>Formato estructurado para desarrollo</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" className="w-full">Descargar JSON</Button>
          </CardContent>
        </Card>

        <Card className="bg-surface border-border hover:border-primary/40 transition-colors cursor-pointer" onClick={doExportVCF}>
          <CardHeader>
            <Smartphone className="h-10 w-10 text-warning mb-2" />
            <CardTitle className="text-base">VCF</CardTitle>
            <CardDescription>Importar en iPhone, Android, Outlook</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="secondary" className="w-full">Descargar VCF</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
