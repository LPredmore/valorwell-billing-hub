
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, RefreshCcw } from "lucide-react";
import { useEnhancedSubmittedClaims } from "@/hooks/useEnhancedSubmittedClaims";
import ClaimCard from "./ClaimCard";

interface EnhancedSubmittedClaimsQueueProps {
  selectedClaimId?: string | null;
  onClaimSelect?: (claimId: string) => void;
}

export default function EnhancedSubmittedClaimsQueue({
  selectedClaimId,
  onClaimSelect
}: EnhancedSubmittedClaimsQueueProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const {
    data: claims,
    isLoading,
    error,
    refetch
  } = useEnhancedSubmittedClaims();

  const filteredClaims = claims?.filter((claim) => {
    const query = searchQuery.toLowerCase();
    const matchesSearch = 
      claim.client.name.toLowerCase().includes(query) ||
      claim.provider.name.toLowerCase().includes(query) ||
      claim.clinical.cpt_code.toLowerCase().includes(query) ||
      claim.claim_claimmd_id.toLowerCase().includes(query);
    
    const matchesStatus = statusFilter === "all" || 
      claim.status.claim_status?.toLowerCase().includes(statusFilter.toLowerCase());
    
    return matchesSearch && matchesStatus;
  }) || [];

  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const displayedClaims = filteredClaims.slice(startIndex, endIndex);
  const totalPages = Math.ceil(filteredClaims.length / itemsPerPage);

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
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Input
            placeholder="Search by patient, provider, CPT code, or claim ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-[200px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => refetch()} variant="outline">
          <RefreshCcw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
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
            {filteredClaims.length === 0 && searchQuery ? 
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
        {searchQuery && ` (filtered from ${claims?.length || 0} total)`}
      </div>
    </div>
  );
}
