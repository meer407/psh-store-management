'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AuditLog } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText, Search } from 'lucide-react';

const ACTION_COLORS: Record<string, string> = {
  INSERT: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  UPDATE: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  DELETE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  const [entityFilter, setEntityFilter] = useState('all');

  useEffect(() => { fetchLogs(); }, []);

  const fetchLogs = async () => {
    const { data } = await supabase.from('audit_logs').select('*')
      .order('created_at', { ascending: false }).limit(500);
    setLogs((data || []) as unknown as AuditLog[]);
    setLoading(false);
  };

  const entities = Array.from(new Set(logs.map(l => l.entity_type)));
  const filtered = logs.filter(l => {
    const matchSearch = (l.user_name || '').toLowerCase().includes(search.toLowerCase()) ||
      l.entity_type.toLowerCase().includes(search.toLowerCase()) ||
      l.action.toLowerCase().includes(search.toLowerCase());
    const matchAction = actionFilter === 'all' || l.action === actionFilter;
    const matchEntity = entityFilter === 'all' || l.entity_type === entityFilter;
    return matchSearch && matchAction && matchEntity;
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ScrollText className="w-6 h-6" /> Audit Log
        </h1>
        <p className="text-muted-foreground text-sm mt-1">Complete activity history of all system actions</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input placeholder="Search logs..." value={search}
                onChange={e => setSearch(e.target.value)} className="pl-9" />
            </div>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-[140px]"><SelectValue placeholder="All actions" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="INSERT">Insert</SelectItem>
                <SelectItem value="UPDATE">Update</SelectItem>
                <SelectItem value="DELETE">Delete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={entityFilter} onValueChange={setEntityFilter}>
              <SelectTrigger className="w-[160px]"><SelectValue placeholder="All entities" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Entities</SelectItem>
                {entities.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
            <Badge variant="secondary">{filtered.length} entries</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>{Array.from({ length: 5 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell>)}</TableRow>
                ))
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">
                    {search || actionFilter !== 'all' || entityFilter !== 'all'
                      ? 'No logs match your filters'
                      : 'No activity logged yet. Actions will appear here as you use the system.'}
                  </TableCell>
                </TableRow>
              ) : filtered.map(log => (
                <TableRow key={log.id}>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{log.user_name || 'System'}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ACTION_COLORS[log.action] || 'bg-gray-100 text-gray-800'}`}>
                      {log.action}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">{log.entity_type}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[300px]">
                    <code className="bg-muted px-1 py-0.5 rounded text-xs">
                      {JSON.stringify(log.details || {}).slice(0, 80)}
                      {JSON.stringify(log.details || {}).length > 80 ? '...' : ''}
                    </code>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
