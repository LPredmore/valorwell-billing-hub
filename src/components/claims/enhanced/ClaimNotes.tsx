
import { FileText } from "lucide-react";

interface ClaimNotesProps {
  notes: {
    billing_notes: string | null;
  };
}

export default function ClaimNotes({ notes }: ClaimNotesProps) {
  if (!notes.billing_notes) return null;

  return (
    <div className="bg-purple-50 rounded-lg p-4">
      <h4 className="font-medium mb-3 flex items-center gap-2">
        <FileText className="h-4 w-4" />
        Notes
      </h4>
      
      <div className="text-sm">
        <div className="whitespace-pre-wrap">{notes.billing_notes}</div>
      </div>
    </div>
  );
}
