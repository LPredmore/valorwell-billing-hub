
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FileSpreadsheet } from "lucide-react";

interface ExportOptions {
  format: 'csv' | 'pdf' | 'excel';
  fields: string[];
  includeFiltered: boolean;
  includeDetails: boolean;
}

interface ClaimsExportDialogProps {
  claimsCount: number;
  filteredCount: number;
  onExport: (options: ExportOptions) => void;
}

const EXPORT_FIELDS = [
  { id: 'patient_name', label: 'Patient Name', required: true },
  { id: 'claim_id', label: 'Claim ID', required: true },
  { id: 'service_date', label: 'Service Date', required: false },
  { id: 'provider_name', label: 'Provider Name', required: false },
  { id: 'cpt_code', label: 'CPT Code', required: false },
  { id: 'billed_amount', label: 'Billed Amount', required: false },
  { id: 'paid_amount', label: 'Paid Amount', required: false },
  { id: 'patient_responsibility', label: 'Patient Responsibility', required: false },
  { id: 'claim_status', label: 'Claim Status', required: false },
  { id: 'submission_date', label: 'Submission Date', required: false },
  { id: 'insurance_company', label: 'Insurance Company', required: false },
  { id: 'diagnosis_codes', label: 'Diagnosis Codes', required: false },
  { id: 'denial_reason', label: 'Denial Reason', required: false },
  { id: 'adjustment_details', label: 'Adjustment Details', required: false }
];

export default function ClaimsExportDialog({ claimsCount, filteredCount, onExport }: ClaimsExportDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({
    format: 'csv',
    fields: EXPORT_FIELDS.filter(f => f.required).map(f => f.id),
    includeFiltered: true,
    includeDetails: false
  });

  const handleFieldToggle = (fieldId: string, checked: boolean) => {
    const field = EXPORT_FIELDS.find(f => f.id === fieldId);
    if (field?.required) return; // Don't allow unchecking required fields

    setOptions(prev => ({
      ...prev,
      fields: checked 
        ? [...prev.fields, fieldId]
        : prev.fields.filter(id => id !== fieldId)
    }));
  };

  const handleExport = () => {
    onExport(options);
    setIsOpen(false);
  };

  const getExportCount = () => {
    return options.includeFiltered ? filteredCount : claimsCount;
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Download className="h-4 w-4" />
          Export
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Claims Data</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* Export Format */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Export Format</label>
            <Select
              value={options.format}
              onValueChange={(value) => setOptions(prev => ({ ...prev, format: value as ExportOptions['format'] }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    CSV (Comma Separated Values)
                  </div>
                </SelectItem>
                <SelectItem value="excel">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel (.xlsx)
                  </div>
                </SelectItem>
                <SelectItem value="pdf">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    PDF Report
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Data Scope */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Data Scope</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeFiltered"
                  checked={options.includeFiltered}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeFiltered: !!checked }))}
                />
                <label htmlFor="includeFiltered" className="text-sm">
                  Export only filtered results ({filteredCount} claims)
                </label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeAll"
                  checked={!options.includeFiltered}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeFiltered: !checked }))}
                />
                <label htmlFor="includeAll" className="text-sm">
                  Export all claims ({claimsCount} claims)
                </label>
              </div>
            </div>
          </div>

          {/* Export Options */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Export Options</label>
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeDetails"
                  checked={options.includeDetails}
                  onCheckedChange={(checked) => setOptions(prev => ({ ...prev, includeDetails: !!checked }))}
                />
                <label htmlFor="includeDetails" className="text-sm">
                  Include detailed claim information (JSON responses, adjustments)
                </label>
              </div>
            </div>
          </div>

          {/* Field Selection */}
          <div className="space-y-3">
            <label className="text-sm font-medium">Fields to Include</label>
            <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
              {EXPORT_FIELDS.map((field) => (
                <div key={field.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={field.id}
                    checked={options.fields.includes(field.id)}
                    onCheckedChange={(checked) => handleFieldToggle(field.id, !!checked)}
                    disabled={field.required}
                  />
                  <label htmlFor={field.id} className="text-sm flex items-center gap-2">
                    {field.label}
                    {field.required && <Badge variant="secondary" className="text-xs">Required</Badge>}
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Export Summary */}
          <div className="bg-muted p-4 rounded-lg">
            <div className="text-sm space-y-1">
              <div>Format: <span className="font-medium">{options.format.toUpperCase()}</span></div>
              <div>Claims: <span className="font-medium">{getExportCount()}</span></div>
              <div>Fields: <span className="font-medium">{options.fields.length}</span></div>
              {options.includeDetails && <div>Includes: <span className="font-medium">Detailed information</span></div>}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleExport} className="gap-2">
              <Download className="h-4 w-4" />
              Export {getExportCount()} Claims
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
