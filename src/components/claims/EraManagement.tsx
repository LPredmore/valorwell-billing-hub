import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, RefreshCcw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, subMonths } from "date-fns";
import { DateRange } from "react-day-picker";
import { DateRangePicker } from "../ui/date-range-picker";

const EraManagement = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("all-eras");
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [isRetrievingEra, setIsRetrievingEra] = useState(false);
  
  // Date range state for ERA retrieval
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subMonths(new Date(), 1),
    to: new Date(),
  });

  const handleRetrieveEra = () => {
    if (!dateRange?.from) {
      toast({
        title: "Date range required",
        description: "Please select a start date for ERA retrieval",
        variant: "destructive",
      });
      return;
    }

    setIsRetrievingEra(true);
    
    // Simulate ERA retrieval
    setTimeout(() => {
      setIsRetrievingEra(false);
      toast({
        title: "ERA Retrieval",
        description: "ERA retrieval functionality will be available after ClaimMD integration is complete.",
      });
    }, 2000);
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="all-eras">ERA Files</TabsTrigger>
          <TabsTrigger value="pending-reconciliation">Pending Reconciliation</TabsTrigger>
        </TabsList>
        
        <TabsContent value="all-eras" className="space-y-4">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle>ERA Files</CardTitle>
              <div className="flex items-center space-x-2">
                <DateRangePicker 
                  dateRange={dateRange}
                  onDateRangeChange={setDateRange}
                  disabled={isRetrievingEra}
                />
                <Button 
                  onClick={handleRetrieveEra}
                  variant="outline" 
                  className="flex items-center space-x-1"
                  disabled={isRetrievingEra}
                >
                  {isRetrievingEra ? (
                    <>
                      <RefreshCcw className="h-4 w-4 mr-1 animate-spin" />
                      <span>Processing...</span>
                    </>
                  ) : (
                    <>
                      <FileText className="h-4 w-4 mr-1" />
                      <span>Retrieve ERA</span>
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                ERA files will be available after ClaimMD integration is complete.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="pending-reconciliation" className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Payments Pending Reconciliation</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                Payment reconciliation will be available after ClaimMD integration is complete.
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default EraManagement;