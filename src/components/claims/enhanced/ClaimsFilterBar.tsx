
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Search, Filter, X, Calendar as CalendarIcon, SortAsc, SortDesc } from "lucide-react";
import { format } from "date-fns";

export interface ClaimsFilter {
  search: string;
  status: string;
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  amountRange: {
    min: number | null;
    max: number | null;
  };
  provider: string;
  insurance: string;
  cptCode: string;
}

export interface ClaimsSort {
  field: 'date' | 'amount' | 'status' | 'patient' | 'provider';
  direction: 'asc' | 'desc';
}

interface ClaimsFilterBarProps {
  filters: ClaimsFilter;
  sort: ClaimsSort;
  onFiltersChange: (filters: ClaimsFilter) => void;
  onSortChange: (sort: ClaimsSort) => void;
  onResetFilters: () => void;
  totalCount: number;
  filteredCount: number;
}

export default function ClaimsFilterBar({
  filters,
  sort,
  onFiltersChange,
  onSortChange,
  onResetFilters,
  totalCount,
  filteredCount
}: ClaimsFilterBarProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleFilterChange = (key: keyof ClaimsFilter, value: any) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const handleSortChange = (field: ClaimsSort['field']) => {
    const direction = sort.field === field && sort.direction === 'asc' ? 'desc' : 'asc';
    onSortChange({ field, direction });
  };

  const getActiveFilterCount = () => {
    let count = 0;
    if (filters.search) count++;
    if (filters.status !== 'all') count++;
    if (filters.dateRange.from || filters.dateRange.to) count++;
    if (filters.amountRange.min !== null || filters.amountRange.max !== null) count++;
    if (filters.provider) count++;
    if (filters.insurance) count++;
    if (filters.cptCode) count++;
    return count;
  };

  const activeFilterCount = getActiveFilterCount();

  return (
    <div className="space-y-4 p-4 border rounded-lg bg-card">
      {/* Primary Filter Row */}
      <div className="flex flex-col sm:flex-row gap-4">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search claims by patient, provider, claim ID, or CPT code..."
            value={filters.search}
            onChange={(e) => handleFilterChange('search', e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Status Filter */}
        <Select
          value={filters.status}
          onValueChange={(value) => handleFilterChange('status', value)}
        >
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="accepted">Accepted</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="denied">Denied</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
          </SelectContent>
        </Select>

        {/* Sort Controls */}
        <div className="flex gap-2">
          <Select
            value={sort.field}
            onValueChange={(value) => onSortChange({ ...sort, field: value as ClaimsSort['field'] })}
          >
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date">Date</SelectItem>
              <SelectItem value="patient">Patient</SelectItem>
              <SelectItem value="provider">Provider</SelectItem>
              <SelectItem value="amount">Amount</SelectItem>
              <SelectItem value="status">Status</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="icon"
            onClick={() => onSortChange({ ...sort, direction: sort.direction === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.direction === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
          </Button>
        </div>

        {/* Advanced Filter Toggle */}
        <Button
          variant="outline"
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4 border-t">
          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Date Range</label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {filters.dateRange.from ? format(filters.dateRange.from, "MMM dd") : "From"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.from || undefined}
                    onSelect={(date) => handleFilterChange('dateRange', { ...filters.dateRange, from: date || null })}
                  />
                </PopoverContent>
              </Popover>
              
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full">
                    <CalendarIcon className="h-4 w-4 mr-2" />
                    {filters.dateRange.to ? format(filters.dateRange.to, "MMM dd") : "To"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filters.dateRange.to || undefined}
                    onSelect={(date) => handleFilterChange('dateRange', { ...filters.dateRange, to: date || null })}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Amount Range */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Amount Range</label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min $"
                value={filters.amountRange.min || ''}
                onChange={(e) => handleFilterChange('amountRange', { 
                  ...filters.amountRange, 
                  min: e.target.value ? parseFloat(e.target.value) : null 
                })}
              />
              <Input
                type="number"
                placeholder="Max $"
                value={filters.amountRange.max || ''}
                onChange={(e) => handleFilterChange('amountRange', { 
                  ...filters.amountRange, 
                  max: e.target.value ? parseFloat(e.target.value) : null 
                })}
              />
            </div>
          </div>

          {/* Provider Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Provider</label>
            <Input
              placeholder="Provider name"
              value={filters.provider}
              onChange={(e) => handleFilterChange('provider', e.target.value)}
            />
          </div>

          {/* Insurance Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Insurance</label>
            <Input
              placeholder="Insurance company"
              value={filters.insurance}
              onChange={(e) => handleFilterChange('insurance', e.target.value)}
            />
          </div>

          {/* CPT Code Filter */}
          <div className="space-y-2">
            <label className="text-sm font-medium">CPT Code</label>
            <Input
              placeholder="CPT code"
              value={filters.cptCode}
              onChange={(e) => handleFilterChange('cptCode', e.target.value)}
            />
          </div>

          {/* Reset Button */}
          <div className="space-y-2">
            <label className="text-sm font-medium invisible">Reset</label>
            <Button variant="outline" onClick={onResetFilters} className="w-full">
              <X className="h-4 w-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </div>
      )}

      {/* Filter Summary */}
      {activeFilterCount > 0 && (
        <div className="flex items-center justify-between pt-2 border-t text-sm text-muted-foreground">
          <span>
            Showing {filteredCount} of {totalCount} claims
          </span>
          <div className="flex gap-2">
            {filters.search && (
              <Badge variant="secondary" className="gap-1">
                Search: {filters.search}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleFilterChange('search', '')}
                />
              </Badge>
            )}
            {filters.status !== 'all' && (
              <Badge variant="secondary" className="gap-1">
                Status: {filters.status}
                <X 
                  className="h-3 w-3 cursor-pointer" 
                  onClick={() => handleFilterChange('status', 'all')}
                />
              </Badge>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
