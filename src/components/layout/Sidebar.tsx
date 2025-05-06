
import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  FileCheck,
  ClipboardList,
  CreditCard,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

type SidebarItem = {
  name: string;
  icon: React.ElementType;
  path: string;
};

const items: SidebarItem[] = [
  { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
  { name: 'Patients', icon: Users, path: '/patients' },
  { name: 'Insurance Verification', icon: FileCheck, path: '/verification' },
  { name: 'Claims', icon: ClipboardList, path: '/claims' },
  { name: 'Payments', icon: CreditCard, path: '/payments' },
  { name: 'Reports', icon: BarChart3, path: '/reports' },
  { name: 'Settings', icon: Settings, path: '/settings' },
];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const toggleSidebar = () => setCollapsed(!collapsed);

  return (
    <div 
      className={cn(
        "h-screen bg-white border-r border-gray-200 flex flex-col transition-all duration-300",
        collapsed ? "w-[70px]" : "w-[250px]"
      )}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        {!collapsed && (
          <div className="flex items-center">
            <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-valorwell-purple to-valorwell-purple-dark">
              ValorWell
            </span>
          </div>
        )}
        <Button 
          variant="ghost" 
          size="icon" 
          onClick={toggleSidebar}
          className={cn("rounded-full", collapsed && "mx-auto")}
        >
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </Button>
      </div>
      
      <nav className="flex-1 py-6 overflow-y-auto">
        <ul className="space-y-1 px-2">
          {items.map((item) => {
            const isActive = location.pathname === item.path;
            
            return collapsed ? (
              <TooltipProvider key={item.name}>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <li>
                      <Button
                        variant={isActive ? "default" : "ghost"}
                        size="icon"
                        className={cn(
                          "w-full h-10 justify-center mb-1",
                          isActive && "bg-valorwell-purple text-white hover:bg-valorwell-purple-dark"
                        )}
                        onClick={() => navigate(item.path)}
                      >
                        <item.icon size={20} />
                        <span className="sr-only">{item.name}</span>
                      </Button>
                    </li>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    {item.name}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <li key={item.name}>
                <Button
                  variant={isActive ? "default" : "ghost"}
                  className={cn(
                    "w-full justify-start", 
                    isActive && "bg-valorwell-purple text-white hover:bg-valorwell-purple-dark"
                  )}
                  onClick={() => navigate(item.path)}
                >
                  <item.icon size={20} className="mr-3" />
                  {item.name}
                </Button>
              </li>
            );
          })}
        </ul>
      </nav>
      
      <div className="p-4 border-t border-gray-200">
        {!collapsed && (
          <div className="text-xs text-gray-500">
            ValorWell Billing Hub v1.0
          </div>
        )}
      </div>
    </div>
  );
}
