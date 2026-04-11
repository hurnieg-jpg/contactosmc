import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/lib/contact-engine';
import { Search, Users } from 'lucide-react';

interface ResultsTabProps {
  contacts: Contact[];
}

export function ResultsTab({ contacts }: ResultsTabProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  const filtered = useMemo(() => {
    return contacts.filter(c => {
      if (search) {
        const q = search.toLowerCase();
        if (!Object.values(c).some(v => String(v).toLowerCase().includes(q))) return false;
      }
      if (filter === 'withPhone') return !!c.whatsapp && !c.whatsapp.startsWith('?');
      if (filter === 'withEmail') return !!c.email;
      if (filter === 'lowConfidence') return c.confidence < 0.5;
      return true;
    });
  }, [contacts, search, filter]);

  if (contacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
        <Users className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">Sin resultados aún</p>
        <p className="text-sm">Procesá archivos para ver contactos aquí.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contactos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 bg-surface"
          />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-44 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos ({contacts.length})</SelectItem>
            <SelectItem value="withPhone">Con teléfono</SelectItem>
            <SelectItem value="withEmail">Con email</SelectItem>
            <SelectItem value="lowConfidence">Baja confianza</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} contacto(s)</p>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[500px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0">
              <tr className="bg-surface text-muted-foreground text-xs">
                <th className="px-3 py-2.5 text-left font-medium">Nombre</th>
                <th className="px-3 py-2.5 text-left font-medium">Apellido</th>
                <th className="px-3 py-2.5 text-left font-medium">Empresa</th>
                <th className="px-3 py-2.5 text-left font-medium">Cargo</th>
                <th className="px-3 py-2.5 text-left font-medium">WhatsApp</th>
                <th className="px-3 py-2.5 text-left font-medium">Email</th>
                <th className="px-3 py-2.5 text-left font-medium">Conf.</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((c, i) => (
                <tr key={i} className={`border-t border-border transition-colors hover:bg-surface/60 ${c.confidence < 0.5 ? 'bg-warning/5' : ''}`}>
                  <td className="px-3 py-2">{c.nombre}</td>
                  <td className="px-3 py-2">{c.apellido}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.empresa}</td>
                  <td className="px-3 py-2 text-muted-foreground">{c.cargo}</td>
                  <td className="px-3 py-2 font-mono text-xs">{c.whatsapp}</td>
                  <td className="px-3 py-2 text-xs">{c.email}</td>
                  <td className="px-3 py-2">
                    <Badge variant={c.confidence >= 0.7 ? 'default' : c.confidence >= 0.5 ? 'secondary' : 'destructive'} className="text-xs">
                      {c.confidence.toFixed(2)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
