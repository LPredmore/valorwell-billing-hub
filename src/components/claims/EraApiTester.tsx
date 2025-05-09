
import React, { useState } from 'react';
import { useEraApiTest } from '@/hooks/useClaimsData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Loader2, Bug, AlertCircle, CheckCircle } from 'lucide-react';

export default function EraApiTester() {
  const [activeTab, setActiveTab] = useState<string>('test1');
  const [testResults, setTestResults] = useState<any>(null);
  const { mutate: runTest, isPending } = useEraApiTest();
  
  const handleRunTest = (testNumber: number) => {
    setTestResults(null);
    runTest(
      { testNumber },
      {
        onSuccess: (data) => {
          setTestResults(data.testResult);
        }
      }
    );
  };
  
  const handleRunAllTests = () => {
    setTestResults(null);
    runTest(
      { runAllTests: true },
      {
        onSuccess: (data) => {
          setTestResults(data.testResults);
        }
      }
    );
  };
  
  const formatJson = (json: any) => {
    try {
      return JSON.stringify(json, null, 2);
    } catch (e) {
      return String(json);
    }
  };
  
  const renderTestResult = (result: any) => {
    if (!result) return null;
    
    return (
      <div className="space-y-4">
        <Alert variant={result.success ? 'default' : 'destructive'}>
          {result.success ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertTitle>
            Test {result.testNumber} {result.success ? 'Succeeded' : 'Failed'}
          </AlertTitle>
          <AlertDescription>
            Status: {result.statusCode || 'Unknown'} 
            {result.error && <span className="block mt-1">Error: {result.error}</span>}
          </AlertDescription>
        </Alert>
        
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Request Parameters:</h4>
          <pre className="bg-slate-100 p-2 rounded text-xs overflow-x-auto">
            {formatJson(result.requestBody)}
          </pre>
        </div>
        
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Response:</h4>
          <pre className="bg-slate-100 p-2 rounded text-xs overflow-x-auto max-h-[200px]">
            {formatJson(result.responseData)}
          </pre>
        </div>
      </div>
    );
  };
  
  const renderMultipleResults = (results: any[]) => {
    if (!results || !Array.isArray(results)) return null;
    
    return (
      <div className="space-y-6">
        {results.map((result) => (
          <div key={result.testNumber} className="p-4 border rounded-md">
            <h3 className="font-medium mb-4">Test {result.testNumber}</h3>
            {renderTestResult(result)}
          </div>
        ))}
      </div>
    );
  };
  
  return (
    <Card className="border-dashed border-orange-300 mb-4">
      <CardHeader className="pb-3 bg-orange-50">
        <CardTitle className="flex items-center gap-2">
          <Bug className="h-4 w-4" />
          ERA API Test Console
        </CardTitle>
        <CardDescription>
          Run diagnostic tests against the ERA API endpoints
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="test1">Test 1</TabsTrigger>
            <TabsTrigger value="test2">Test 2</TabsTrigger>
            <TabsTrigger value="test3">Test 3</TabsTrigger>
            <TabsTrigger value="test4">Test 4</TabsTrigger>
            <TabsTrigger value="all">Run All</TabsTrigger>
          </TabsList>
          
          <div className="mt-4 mb-2">
            <TabsContent value="test1">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Test 1:</strong> Absolute Minimal Request - Only AccountKey and NewOnly=1
              </p>
              <Button 
                onClick={() => handleRunTest(1)} 
                disabled={isPending}
                variant="secondary"
                size="sm"
                className="mb-4"
              >
                {isPending && activeTab === 'test1' && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run Test
              </Button>
            </TabsContent>
            
            <TabsContent value="test2">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Test 2:</strong> Minimal Request - All ERAs (NewOnly=0)
              </p>
              <Button 
                onClick={() => handleRunTest(2)} 
                disabled={isPending}
                variant="secondary"
                size="sm"
                className="mb-4"
              >
                {isPending && activeTab === 'test2' && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run Test
              </Button>
            </TabsContent>
            
            <TabsContent value="test3">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Test 3:</strong> Date Parameter - ReceivedAfterDate Only (05-01-2025)
              </p>
              <Button 
                onClick={() => handleRunTest(3)} 
                disabled={isPending}
                variant="secondary"
                size="sm"
                className="mb-4"
              >
                {isPending && activeTab === 'test3' && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run Test
              </Button>
            </TabsContent>
            
            <TabsContent value="test4">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Test 4:</strong> Date Range (ReceivedAfterDate=05-09-2025 & ReceivedBeforeDate=05-09-2025)
              </p>
              <Button 
                onClick={() => handleRunTest(4)} 
                disabled={isPending}
                variant="secondary"
                size="sm"
                className="mb-4"
              >
                {isPending && activeTab === 'test4' && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run Test
              </Button>
            </TabsContent>
            
            <TabsContent value="all">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Run All Tests:</strong> Execute all test cases sequentially
              </p>
              <Button 
                onClick={handleRunAllTests} 
                disabled={isPending}
                variant="secondary"
                size="sm"
                className="mb-4"
              >
                {isPending && activeTab === 'all' && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Run All Tests
              </Button>
            </TabsContent>
          </div>
        </Tabs>
        
        <div>
          <h3 className="font-medium mb-2">Test Results:</h3>
          <ScrollArea className="h-[400px] border rounded-md p-2">
            {isPending ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-muted-foreground" />
                  <p className="text-muted-foreground">Running test...</p>
                </div>
              </div>
            ) : testResults ? (
              Array.isArray(testResults) ? renderMultipleResults(testResults) : renderTestResult(testResults)
            ) : (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Run a test to see results</p>
              </div>
            )}
          </ScrollArea>
        </div>
      </CardContent>
      <CardFooter className="bg-orange-50">
        <p className="text-xs text-muted-foreground">
          These tests are intended for debugging ERA API issues. Results are logged to the API logs table.
        </p>
      </CardFooter>
    </Card>
  );
}
