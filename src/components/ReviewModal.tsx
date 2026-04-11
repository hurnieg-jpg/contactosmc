import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Contact } from '@/lib/contact-engine';

interface ReviewModalProps {
  open: boolean;
  contacts: Contact[];
  onSave: (accepted: Contact[]) => void;
  onCancel: () => void;
}

export function ReviewModal({ open, contacts, onSave, onCancel }: ReviewModalProps) {
  const [edits, setEdits] = useState(() =>
    contacts.map(c => ({ ...c, accepted: true }))
  );

  const updateField = (idx: number, field: keyof Contact, value: string) => {
    setEdits(prev => prev.map((e, i) => i === idx ? { ...e, [field]: value } : e));
  };

  const toggleAccept = (idx: number) => {
    setEdits(prev => prev.map((e, i) => i === idx ? { ...e, accepted: !e.accepted } : e));
  };

  const handleSave = () => {
    const accepted = edits.filter(e => e.accepted).map(({ accepted: _, ...rest }) => rest as Contact);
    onSave(accepted);
  };

  return (
    <Dialog open={open} onOpenChange={() => onCancel()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>🔍 Revisar contactos con baja confianza ({contacts.length})</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {edits.map((c, i) => (
            <div key={i} className={`border border-border rounded-lg p-4 space-y-2 ${!c.accepted ? 'opacity-40' : ''}`}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">Contacto {i + 1}</span>
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={c.accepted} onChange={() => toggleAccept(i)} />
                  Aceptar
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="Nombre" value={c.nombre} onChange={e => updateField(i, 'nombre', e.target.value)} />
                <Input placeholder="Apellido" value={c.apellido} onChange={e => updateField(i, 'apellido', e.target.value)} />
                <Input placeholder="Empresa" value={c.empresa} onChange={e => updateField(i, 'empresa', e.target.value)} />
                <Input placeholder="Cargo" value={c.cargo} onChange={e => updateField(i, 'cargo', e.target.value)} />
                <Input placeholder="WhatsApp" value={c.whatsapp} onChange={e => updateField(i, 'whatsapp', e.target.value)} />
                <Input placeholder="Email" value={c.email} onChange={e => updateField(i, 'email', e.target.value)} />
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>Cancelar</Button>
          <Button onClick={handleSave}>Guardar cambios</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
