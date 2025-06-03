
interface ClaimClinicalProps {
  clinical: {
    cpt_code: string;
    modifiers: string[];
    diagnosis_code_pointers: string;
    place_of_service_code: string;
  };
}

export default function ClaimClinical({ clinical }: ClaimClinicalProps) {
  return (
    <div className="bg-blue-50 rounded-lg p-4">
      <h4 className="font-medium mb-3">Clinical Information</h4>
      
      <div className="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="text-muted-foreground">CPT Code</div>
          <div className="font-medium">{clinical.cpt_code || "Not specified"}</div>
        </div>
        
        <div>
          <div className="text-muted-foreground">Place of Service</div>
          <div className="font-medium">{clinical.place_of_service_code || "Not specified"}</div>
        </div>
        
        {clinical.modifiers && clinical.modifiers.length > 0 && (
          <div>
            <div className="text-muted-foreground">Modifiers</div>
            <div className="font-medium">{clinical.modifiers.join(", ")}</div>
          </div>
        )}
        
        {clinical.diagnosis_code_pointers && (
          <div>
            <div className="text-muted-foreground">Diagnosis Pointers</div>
            <div className="font-medium">{clinical.diagnosis_code_pointers}</div>
          </div>
        )}
      </div>
    </div>
  );
}
