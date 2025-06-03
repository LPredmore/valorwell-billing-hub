
import { useState } from "react";
import { useEnhancedSubmittedClaims } from "@/hooks/useEnhancedSubmittedClaims";
import { useClaimsFiltering } from "@/hooks/useClaimsFiltering";
import { Button } from "@/components/ui/button";
import { RefreshCcw } from "lucide-react";
import ClaimsFilterBar, { ClaimsFilter, ClaimsSort } from "./ClaimsFilterBar";
import ClaimsExportDialog from "./ClaimsExportDialog";
import ClaimCard from "./ClaimCard";
import { exportClaimsToCSV, exportClaimsToPDF, exportClaimsToExcel } from "@/utils/claimsExportUtils";

interface EnhancedSubmittedClaimsQueueProps {
  selectedClaimId?: string | null;
  onClaimSelect?: (claimId: string) => void;
}

const defaultFilters: ClaimsFilter = {
  search: '',
  status: 'all',
  dateRange: { from: null, to: null },
  amountRange: { min: null, max: null },
  provider: '',
  insurance: '',
  cptCode: ''
};

const defaultSort: ClaimsSort = {
  field: 'date',
  direction: 'desc'
};

export default function EnhancedSubmittedClaimsQueue({
  selectedClaimId,
  onClaimSelect
}: EnhancedSubmittedClaimsQueueProps) {
  const [filters, setFilters] = useState<ClaimsFilter>(defaultFilters);
  const [sort, setSort] = useState<ClaimsSort>(defaultSort);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const {
    data: claims,
    isLoading,
    error,
    refetch
  } = useEnhancedSubmittedClaims();

  const filteredClaims = useClaimsFiltering(claims || [], filters, sort);

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedClaims = filteredClaims.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredClaims.length / itemsPerPage);

  const handleResetFilters = () => {
    setFilters(defaultFilters);
    setSort(defaultSort);
    setCurrentPage(1);
  };

  const handleExport = (options: any) => {
    const claimsToExport = options.includeFiltered ? filteredClaims : (claims || []);
    
    switch (options.format) {
      case 'csv':
        exportClaimsToCSV(claimsToExport, options);
        break;
      case 'pdf':
        exportClaimsToPDF(claimsToExport, options);
        break;
      case 'excel':
        exportClaimsToExcel(claimsToExport, options);
        break;
    }
  };

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-6 text-center rounded-md bg-destructive/10 border border-destructive/20">
        <h3 className="font-medium text-destructive">Failed to load submitted claims</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {error instanceof Error ? error.message : "An unknown error occurred"}
        </p>
        <Button onClick={() => refetch()} className="mt-3">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filter and Export Controls */}
      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <ClaimsFilterBar
            filters={filters}
            sort={sort}
            onFiltersChange={setFilters}
            onSortChange={setSort}
            onResetFilters={handleResetFilters}
            totalCount={claims?.length || 0}
            filteredCount={filteredClaims.length}
          />
        </div>
        <div className="flex gap-2">
          <ClaimsExportDialog
            claimsCount={claims?.length || 0}
            filteredCount={filteredClaims.length}
            onExport={handleExport}
          />
          <Button onClick={() => refetch()} variant="outline">
            <RefreshCcw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Claims List */}
      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="h-32 bg-gray-100 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : displayedClaims.length === 0 ? (
        <div className="text-center p-8">
          <div className="text-lg font-medium mb-2">
            {filteredClaims.length === 0 && filters.search ? 
              "No submitted claims match your search" : 
              claims?.length === 0 ? "No submitted claims found" : "No results for current filters"
            }
          </div>
          <div className="text-muted-foreground">
            Total claims in database: {claims?.length || 0}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {displayedClaims.map((claim) => (
            <ClaimCard
              key={claim.id}
              claim={claim}
              isSelected={selectedClaimId === claim.id}
              onSelect={onClaimSelect ? () => onClaimSelect(claim.id) : undefined}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center mt-6 space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
            disabled={currentPage === 1}
          >
            Previous
          </Button>
          <div className="flex items-center space-x-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const page = i + 1;
              return (
                <Button
                  key={page}
                  variant={page === currentPage ? "default" : "outline"}
                  size="sm"
                  className="w-8 h-8 p-0"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
            disabled={currentPage === totalPages}
          >
            Next
          </Button>
        </div>
      )}
      
      <div className="text-sm text-muted-foreground text-center">
        Showing {displayedClaims.length} of {filteredClaims.length} claims
        {filters.search && ` (filtered from ${claims?.length || 0} total)`}
      </div>
    </div>
  );
}
