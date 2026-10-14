import { useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check, CheckCircle2,
  ChevronDown, CircleHelp, Clock3, DoorOpen, Filter, House, LockKeyhole, MoreHorizontal,
  Router as RouterIcon, Search, Shield, ShieldAlert, ShieldCheck, Siren, SlidersHorizontal, Speaker,
  Thermometer, Wifi, X,
} from 'lucide-react';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient();

type Device = {
  id: string; name: string; category: string; room: string; trust: 'Trusted' | 'Review' | 'At risk';
  ip: string; seen: string; firmware: string; quarantined?: boolean;
};
type Alert = {
  id: string; severity: 'Critical' | 'High' | 'Medium'; title: string; device: string;
  description: string; time: string; resolved: boolean; acknowledged: boolean;
};

const initialDevices: Device[] = [
  { id: 'cam-01', name: 'Front porch camera', category: 'Camera', room: 'Entryway', trust: 'At risk', ip: '192.168.1.24', seen: 'Just now', firmware: 'v2.1.4' },
  { id: 'hub-01', name: 'Home gateway', category: 'Network', room: 'Utility room', trust: 'Trusted', ip: '192.168.1.1', seen: 'Just now', firmware: 'v6.8.2' },
  { id: 'lock-01', name: 'Front door lock', category: 'Smart lock', room: 'Entryway', trust: 'Trusted', ip: '192.168.1.31', seen: '2 min ago', firmware: 'v4.3.0' },
  { id: 'therm-01', name: 'Nest thermostat', category: 'Climate', room: 'Hallway', trust: 'Trusted', ip: '192.168.1.46', seen: '4 min ago', firmware: 'v5.12.1' },
  { id: 'speaker-01', name: 'Kitchen speaker', category: 'Speaker', room: 'Kitchen', trust: 'Review', ip: '192.168.1.58', seen: '8 min ago', firmware: 'v1.9.7' },
  { id: 'sensor-01', name: 'Back door sensor', category: 'Sensor', room: 'Back door', trust: 'Trusted', ip: '192.168.1.63', seen: '12 min ago', firmware: 'v3.0.6' },
  { id: 'cam-02', name: 'Nursery monitor', category: 'Camera', room: 'Nursery', trust: 'Trusted', ip: '192.168.1.72', seen: '16 min ago', firmware: 'v2.4.2' },
];
const initialAlerts: Alert[] = [
  { id: 'a-104', severity: 'Critical', title: 'Unusual outbound traffic', device: 'Front porch camera', description: 'This camera contacted an unfamiliar server outside your home network.', time: '4 min ago', resolved: false, acknowledged: false },
  { id: 'a-103', severity: 'High', title: 'Firmware update overdue', device: 'Kitchen speaker', description: 'A security update has been available for this device for 18 days.', time: '37 min ago', resolved: false, acknowledged: false },
  { id: 'a-102', severity: 'Medium', title: 'New device joined network', device: 'Unknown device · 192.168.1.88', description: 'A device you have not seen before connected to your Wi-Fi.', time: '2 hr ago', resolved: false, acknowledged: true },
  { id: 'a-101', severity: 'Medium', title: 'Login from new location', device: 'Home gateway', description: 'Admin access was recorded from a new local address.', time: 'Yesterday', resolved: true, acknowledged: true },
];
const todayLabel = new Intl.DateTimeFormat('en-US', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
}).format(new Date()).toUpperCase();

const deviceGlyph = (category: string) => {
  if (category === 'Camera') return <div className="device-icon camera"><Shield size={17} /></div>;
  if (category === 'Smart lock') return <div className="device-icon lock"><LockKeyhole size={17} /></div>;
  if (category === 'Climate') return <div className="device-icon climate"><Thermometer size={17} /></div>;
  if (category === 'Network') return <div className="device-icon network"><RouterIcon size={17} /></div>;
  if (category === 'Speaker') return <div className="device-icon speaker"><Speaker size={17} /></div>;
  return <div className="device-icon sensor"><DoorOpen size={17} /></div>;
};

function Home() {
  const [devices, setDevices] = useState(initialDevices);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('All devices');
  const [severityFilter, setSeverityFilter] = useState('All severity');
  const [alertState, setAlertState] = useState('Active');
  const [toast, setToast] = useState('');
  const [activeNav, setActiveNav] = useState('Overview');
  const [showFilters, setShowFilters] = useState(false);

  const trustedCount = devices.filter(d => d.trust === 'Trusted' && !d.quarantined).length;
  const riskCount = devices.filter(d => d.trust === 'At risk').length;
  const activeCount = alerts.filter(a => !a.resolved).length;
  const filteredDevices = useMemo(() => devices.filter(d => {
    const matchesSearch = `${d.name} ${d.category} ${d.room} ${d.ip}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (deviceFilter === 'All devices' || (deviceFilter === 'Needs attention' ? d.trust !== 'Trusted' : d.trust === deviceFilter));
  }), [devices, search, deviceFilter]);
  const filteredAlerts = useMemo(() => alerts.filter(a =>
    (severityFilter === 'All severity' || a.severity === severityFilter) &&
    (alertState === 'All alerts' || (alertState === 'Active' ? !a.resolved : a.resolved))
  ), [alerts, severityFilter, alertState]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }
  function quarantine(device: Device) {
    const next = !device.quarantined;
    setDevices(current => current.map(d => d.id === device.id ? { ...d, quarantined: next } : d));
    notify(next ? `${device.name} moved to quarantine` : `${device.name} restored to your network`);
  }
  function updateAlert(id: string, kind: 'acknowledged' | 'resolved') {
    setAlerts(current => current.map(a => a.id === id ? { ...a, [kind]: true, ...(kind === 'resolved' ? { acknowledged: true } : {}) } : a));
    notify(kind === 'resolved' ? 'Alert dismissed' : 'Alert acknowledged');
  }
  const navItems = [
    { title: 'Overview', icon: House }, { title: 'Devices', icon: Wifi, count: devices.length },
    { title: 'Alerts', icon: Bell, count: activeCount },
  ];
  const levelClass = (severity: string) => severity.toLowerCase();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={21} strokeWidth={2.2} /></div>
          <div><div className="brand-name">Hearthguard</div><div className="brand-caption">HOME SECURITY</div></div>
        </div>
        <div className="home-switcher">
          <div className="home-avatar"><House size={17} /></div>
          <div className="home-meta"><strong>Willow Creek</strong><span>Home network</span></div>
          <ChevronDown size={15} className="switch-chevron" />
        </div>
        <div className="nav-label">YOUR HOME</div>
        <nav className="side-nav" aria-label="Dashboard sections">
          {navItems.map(({ title, icon: Icon, count }) => <button key={title} className={`nav-item ${activeNav === title ? 'selected' : ''}`} onClick={() => { setActiveNav(title); if (title === 'Devices') document.getElementById('devices')?.scrollIntoView({ behavior: 'smooth' }); if (title === 'Alerts') document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' }); }} data-testid={`nav-${title.toLowerCase()}`}>
            <Icon size={17} strokeWidth={1.8} /><span>{title}</span>{count !== undefined && <span className="nav-count">{count}</span>}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><CircleHelp size={16} /></div><strong>A little peace of mind</strong><p>We check your devices around the clock, right from your home.</p><button onClick={() => notify('Your home stays protected while you are away.')} data-testid="button-security-tips">How it works <span>↗</span></button></div>
          <div className="profile"><div className="profile-avatar">JM</div><div><strong>Jamie Morgan</strong><span>Homeowner</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Willow Creek</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions"><span className="updated"><span className="live-dot" />Updated just now</span><button className="icon-button" aria-label="Notifications" onClick={() => { setActiveNav('Alerts'); document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' }); }} data-testid="button-notifications"><Bell size={18} /><i /></button><div className="top-avatar">JM</div></div>
        </header>

        <div className="dashboard">
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" />{todayLabel}<span className="simulation-badge">SIMULATED DATA</span></div><h1>Your home, <em>in good hands.</em></h1><p className="welcome-sub">A clear view of what’s connected and what needs your attention.</p></div>
            <button className="secondary-button" onClick={() => { setDevices(initialDevices); setAlerts(initialAlerts); setSearch(''); setDeviceFilter('All devices'); setSeverityFilter('All severity'); setAlertState('Active'); notify('Dashboard refreshed with latest simulated activity'); }} data-testid="button-refresh"><Activity size={15} />Refresh scan <span className="refresh-time">· 2 min ago</span></button>
          </section>

          <section className="posture-panel" aria-label="Security posture">
            <div className="posture-main">
              <div className="posture-topline"><div className="posture-icon"><ShieldAlert size={20} /></div><span className="posture-label">SECURITY POSTURE</span><span className="posture-date">TODAY, 9:41 AM</span></div>
              <div className="posture-title"><h2>Needs a closer look</h2><span className="status-pip" /></div>
              <p>One device is behaving differently than usual. We’ve flagged it so you can take a look.</p>
              <button className="posture-link" onClick={() => { document.getElementById('alerts')?.scrollIntoView({ behavior: 'smooth' }); setActiveNav('Alerts'); }} data-testid="button-review-alert">Review security alert <span>→</span></button>
            </div>
            <div className="posture-visual" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><House size={29} strokeWidth={1.5} /></div>
              <div className="orbit-node node-one"><Check size={13} /></div><div className="orbit-node node-two"><Wifi size={13} /></div><div className="orbit-node node-three"><Shield size={13} /></div>
              <div className="visual-caption">HOME NETWORK <span>●</span> MONITORED</div>
            </div>
            <div className="posture-stats">
              <div className="posture-stat"><span>CONNECTED DEVICES</span><strong>{devices.length.toString().padStart(2, '0')}</strong><small><ArrowUpRight size={12} /> 2 added this month</small></div>
              <div className="stat-divider" />
              <div className="posture-stat"><span>TRUSTED DEVICES</span><strong>{trustedCount.toString().padStart(2, '0')}<i>/{devices.length.toString().padStart(2, '0')}</i></strong><small className="mint"><CheckCircle2 size={12} /> {devices.length - trustedCount} need a look</small></div>
              <div className="stat-divider" />
              <div className="posture-stat"><span>OPEN ALERTS</span><strong>{activeCount.toString().padStart(2, '0')}</strong><small className="amber"><AlertTriangle size={12} /> {riskCount} high priority</small></div>
            </div>
          </section>

          <div className="content-grid">
            <section className="surface devices-surface" id="devices">
              <div className="section-heading"><div><div className="section-kicker">YOUR CONNECTED HOME</div><h2>Devices <span className="heading-count">{devices.length}</span></h2></div><button className={`filter-button ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)} data-testid="button-device-filters"><SlidersHorizontal size={15} /> Filters {deviceFilter !== 'All devices' && <span className="filter-indicator" />}</button></div>
              <div className="device-toolbar">
                <label className="search-field"><Search size={15} /><input type="search" placeholder="Find a device..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-device-search" /><kbd>⌘ K</kbd></label>
                <label className="select-wrap"><Filter size={13} /><select aria-label="Filter devices by trust status" value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)} data-testid="select-device-filter"><option>All devices</option><option>Needs attention</option><option>Trusted</option><option>Review</option><option>At risk</option></select><ChevronDown size={13} /></label>
              </div>
              {showFilters && <div className="filter-note"><span>Showing:</span> {deviceFilter} <button onClick={() => { setDeviceFilter('All devices'); setSearch(''); }} data-testid="button-clear-device-filters">Clear filters</button></div>}
              <div className="device-table">
                <div className="device-table-head"><span>DEVICE</span><span>ROOM</span><span>TRUST STATUS</span><span>LAST SEEN</span><span /></div>
                {filteredDevices.length ? filteredDevices.map(device => <div className={`device-row ${device.quarantined ? 'quarantined' : ''}`} key={device.id} data-testid={`device-row-${device.id}`}>
                  <div className="device-name-cell">{deviceGlyph(device.category)}<div className="device-title-wrap"><strong>{device.name}</strong><span>{device.category} <b>·</b> {device.ip}</span></div></div>
                  <div className="device-room">{device.room}</div>
                  <div><span className={`trust-badge ${device.quarantined ? 'quarantined-badge' : device.trust.toLowerCase().replace(' ', '-')}`}><span />{device.quarantined ? 'Quarantined' : device.trust}</span></div>
                  <div className="last-seen">{device.seen}</div>
                  <div className="device-action"><button className={`quarantine-button ${device.quarantined ? 'restore' : ''}`} onClick={() => quarantine(device)} data-testid={`button-quarantine-${device.id}`}>{device.quarantined ? 'Restore' : 'Quarantine'}</button></div>
                </div>) : <div className="empty-state"><div className="empty-icon"><Search size={19} /></div><strong>No devices match</strong><span>Try a different name or trust filter.</span><button onClick={() => { setSearch(''); setDeviceFilter('All devices'); }} data-testid="button-reset-device-search">Clear search</button></div>}
              </div>
              <div className="table-footer"><span>Showing <strong>{filteredDevices.length}</strong> of {devices.length} devices</span><span><i className="mini-live" /> Live monitoring on</span></div>
            </section>

            <section className="surface alerts-surface" id="alerts">
              <div className="section-heading alert-heading"><div><div className="section-kicker">THE IMPORTANT THINGS</div><h2>Security alerts <span className="alert-count">{activeCount}</span></h2></div><button className="icon-button small-more" aria-label="Alert options" onClick={() => setAlertState(alertState === 'Active' ? 'All alerts' : 'Active')} data-testid="button-alert-options"><MoreHorizontal size={18} /></button></div>
              <div className="alert-controls">
                <label className="select-wrap alert-select"><select aria-label="Filter alerts by severity" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} data-testid="select-alert-severity"><option>All severity</option><option>Critical</option><option>High</option><option>Medium</option></select><ChevronDown size={13} /></label>
                <div className="state-tabs"><button className={alertState === 'Active' ? 'current' : ''} onClick={() => setAlertState('Active')} data-testid="button-alerts-active">Active <span>{activeCount}</span></button><button className={alertState === 'Resolved' ? 'current' : ''} onClick={() => setAlertState('Resolved')} data-testid="button-alerts-resolved">Resolved</button></div>
              </div>
              <div className="alert-list">
                {filteredAlerts.length ? filteredAlerts.map(alert => <article className={`alert-card ${alert.resolved ? 'is-resolved' : ''}`} key={alert.id} data-testid={`alert-card-${alert.id}`}>
                  <div className="alert-accent" data-severity={levelClass(alert.severity)} />
                  <div className="alert-card-content">
                    <div className="alert-meta"><span className={`severity ${levelClass(alert.severity)}`}><i />{alert.severity}</span><span className="alert-time"><Clock3 size={11} />{alert.time}</span></div>
                    <h3>{alert.title}</h3><p>{alert.description}</p>
                    <div className="alert-device"><div className="alert-device-icon"><Wifi size={12} /></div><span>{alert.device}</span></div>
                    {alert.resolved ? <div className="resolved-label"><CheckCircle2 size={13} /> Dismissed</div> : <div className="alert-actions">
                      {!alert.acknowledged && <button className="ack-button" onClick={() => updateAlert(alert.id, 'acknowledged')} data-testid={`button-acknowledge-${alert.id}`}>Acknowledge</button>}
                      {alert.acknowledged && <span className="acknowledged-label"><Check size={12} /> Acknowledged</span>}
                      <button className="dismiss-button" onClick={() => updateAlert(alert.id, 'resolved')} data-testid={`button-dismiss-${alert.id}`}>Dismiss</button>
                    </div>}
                  </div>
                </article>) : <div className="empty-state alerts-empty"><div className="empty-icon calm"><CheckCircle2 size={20} /></div><strong>{alertState === 'Resolved' ? 'Nothing resolved yet' : 'All clear for now'}</strong><span>{alertState === 'Resolved' ? 'Resolved alerts will show up here.' : 'No alerts match these filters.'}</span><button onClick={() => { setSeverityFilter('All severity'); setAlertState('Active'); }} data-testid="button-reset-alert-filters">Reset filters</button></div>}
              </div>
              <div className="alerts-footer"><span><Siren size={13} /> Alerts are monitored locally</span><button onClick={() => { setSeverityFilter('All severity'); setAlertState('All alerts'); }} data-testid="button-view-all-alerts">View all alerts <span>→</span></button></div>
            </section>
          </div>

          <footer className="dashboard-footer"><div><div className="footer-shield"><ShieldCheck size={16} /></div><span><strong>Your home stays yours.</strong> Your data is processed right here, on your network.</span></div><button onClick={() => notify('Your home network is being monitored locally.')} data-testid="button-privacy-details">Privacy details <ArrowDownRight size={13} /></button></footer>
        </div>
      </main>
      {toast && <div role="status" className="toast-message"><CheckCircle2 size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  );
}

function Router() {
  return (
    // Keep a shared shell (sidebar, navbar) outside the boundary so it
    // survives a page crash.
    <RoutedErrorBoundary>
      <Switch>
        <Route path="/" component={Home} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
