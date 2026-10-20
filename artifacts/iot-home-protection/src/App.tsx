import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  Activity, AlertTriangle, ArrowDownRight, ArrowUpRight, Bell, Check, CheckCircle2, Plus,
  ChevronDown, CircleHelp, Clock3, DoorOpen, Filter, House, LockKeyhole, MoreHorizontal,
  Router as RouterIcon, ScanFace, Search, Shield, ShieldAlert, ShieldCheck, Siren, SlidersHorizontal, Speaker,
  Thermometer, Wifi, X,
} from 'lucide-react';
import {
  useLocation,
  Router as WouterRouter,
} from 'wouter';
import { FaceRecognitionPage } from '@/components/face-recognition-page';
import { isFaceRecognitionDemoMode, recognizeFace } from '@/lib/face-recognition';
import type { FaceRecognitionResult } from '@/components/face-recognition-page';

const queryClient = new QueryClient();

type Device = {
  id: string; name: string; category: string; room: string; trust: 'Trusted' | 'Unknown' | 'Restricted';
  ip: string; seen: string; firmware: string; online: boolean; quarantined?: boolean;
};
type Alert = {
  id: string; severity: 'Critical' | 'High' | 'Medium'; title: string; device: string;
  description: string; time: string; resolved: boolean; acknowledged: boolean;
};

const initialDevices: Device[] = [
  { id: 'cam-01', name: 'Front porch camera', category: 'Camera', room: 'Entryway', trust: 'Restricted', ip: '192.168.1.24', seen: 'Just now', firmware: 'v2.1.4', online: true },
  { id: 'hub-01', name: 'Home gateway', category: 'Network', room: 'Utility room', trust: 'Trusted', ip: '192.168.1.1', seen: 'Just now', firmware: 'v6.8.2', online: true },
  { id: 'lock-01', name: 'Front door lock', category: 'Smart lock', room: 'Entryway', trust: 'Trusted', ip: '192.168.1.31', seen: '2 min ago', firmware: 'v4.3.0', online: true },
  { id: 'therm-01', name: 'Nest thermostat', category: 'Climate', room: 'Hallway', trust: 'Trusted', ip: '192.168.1.46', seen: '4 min ago', firmware: 'v5.12.1', online: true },
  { id: 'speaker-01', name: 'Kitchen speaker', category: 'Speaker', room: 'Kitchen', trust: 'Unknown', ip: '192.168.1.58', seen: '8 min ago', firmware: 'v1.9.7', online: true },
  { id: 'sensor-01', name: 'Back door sensor', category: 'Sensor', room: 'Back door', trust: 'Trusted', ip: '192.168.1.63', seen: '12 min ago', firmware: 'v3.0.6', online: true },
  { id: 'cam-02', name: 'Nursery monitor', category: 'Camera', room: 'Nursery', trust: 'Trusted', ip: '192.168.1.72', seen: '16 min ago', firmware: 'v2.4.2', online: false },
];
const initialAlerts: Alert[] = [
  { id: 'a-104', severity: 'Critical', title: 'Unusual outbound traffic', device: 'Front porch camera', description: 'Sample scenario: the camera appears to contact an unfamiliar server in this fictional event.', time: '4 min ago', resolved: false, acknowledged: false },
  { id: 'a-103', severity: 'High', title: 'Firmware update overdue', device: 'Kitchen speaker', description: 'Sample scenario: a security update has been available for this demo device for 18 days.', time: '37 min ago', resolved: false, acknowledged: false },
  { id: 'a-102', severity: 'Medium', title: 'New device joined network', device: 'Unknown device · 192.168.1.88', description: 'Sample scenario: an unfamiliar device appears in this fictional network timeline.', time: '2 hr ago', resolved: false, acknowledged: true },
  { id: 'a-101', severity: 'Medium', title: 'Login from new location', device: 'Home gateway', description: 'Sample scenario: admin access is shown from a new local address in this demo.', time: 'Yesterday', resolved: true, acknowledged: true },
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
  const [location, setLocation] = useLocation();
  const [devices, setDevices] = useState(initialDevices);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [search, setSearch] = useState('');
  const [deviceFilter, setDeviceFilter] = useState('All devices');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [onlineFilter, setOnlineFilter] = useState('All statuses');
  const [trustFilter, setTrustFilter] = useState('All trust states');
  const [severityFilter, setSeverityFilter] = useState('All severity');
  const [alertState, setAlertState] = useState('Active');
  const [eventState, setEventState] = useState('All events');
  const [toast, setToast] = useState('');
  const activeNav = location === '/devices' ? 'Devices' : location === '/security-events' ? 'Security Events' : location === '/face-recognition' ? 'AI Face Recognition' : 'Overview';
  const [showFilters, setShowFilters] = useState(false);
  const [showAddDevice, setShowAddDevice] = useState(false);
  const [formError, setFormError] = useState('');
  const [deviceForm, setDeviceForm] = useState({ name: '', category: 'Camera', room: '', ip: '', firmware: '', online: 'Online' });

  const trustedCount = devices.filter(d => d.trust === 'Trusted').length;
  const highPriorityCount = alerts.filter(a => !a.resolved && (a.severity === 'Critical' || a.severity === 'High')).length;
  const activeCount = alerts.filter(a => !a.resolved).length;
  const filteredDevices = useMemo(() => devices.filter(d => {
    const matchesSearch = `${d.name} ${d.category} ${d.room} ${d.ip}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch &&
      (deviceFilter === 'All devices' || (deviceFilter === 'Needs attention' ? d.trust !== 'Trusted' : d.trust === deviceFilter)) &&
      (typeFilter === 'All types' || d.category === typeFilter) &&
      (onlineFilter === 'All statuses' || (onlineFilter === 'Online' ? d.online : !d.online)) &&
      (trustFilter === 'All trust states' || d.trust === trustFilter);
  }), [devices, search, deviceFilter, typeFilter, onlineFilter, trustFilter]);
  const filteredInventory = useMemo(() => devices.filter(d => {
    const matchesSearch = `${d.name} ${d.category} ${d.room} ${d.ip}`.toLowerCase().includes(search.toLowerCase());
    return matchesSearch &&
      (typeFilter === 'All types' || d.category === typeFilter) &&
      (onlineFilter === 'All statuses' || (onlineFilter === 'Online' ? d.online : !d.online)) &&
      (trustFilter === 'All trust states' || d.trust === trustFilter);
  }), [devices, search, typeFilter, onlineFilter, trustFilter]);
  const filteredAlerts = useMemo(() => alerts.filter(a =>
    (severityFilter === 'All severity' || a.severity === severityFilter) &&
    (alertState === 'All alerts' || (alertState === 'Active' ? !a.resolved : a.resolved))
  ), [alerts, severityFilter, alertState]);
  const filteredEvents = useMemo(() => alerts.filter(a =>
    (severityFilter === 'All severity' || a.severity === severityFilter) &&
    (eventState === 'All events' || (eventState === 'Active' ? !a.resolved : a.resolved))
  ), [alerts, severityFilter, eventState]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(''), 2600);
  }
  function quarantine(device: Device) {
    const next = !device.quarantined;
    setDevices(current => current.map(d => d.id === device.id ? { ...d, quarantined: next } : d));
    notify(next ? `${device.name} moved to quarantine` : `${device.name} restored to your network`);
  }
  function updateTrust(id: string, trust: Device['trust']) {
    setDevices(current => current.map(d => d.id === id ? { ...d, trust } : d));
    notify('Device trust updated');
  }
  function addDevice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!deviceForm.name.trim() || !deviceForm.room.trim()) {
      setFormError('Add a device name and room before saving.');
      return;
    }
    const ipValid = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/.test(deviceForm.ip.trim());
    if (!ipValid) { setFormError('Enter a valid IPv4 address, such as 192.168.1.90.'); return; }
    if (devices.some(device => device.ip === deviceForm.ip.trim())) { setFormError('That IP address is already assigned to a device.'); return; }
    const newDevice: Device = {
      id: `device-${Date.now()}-${devices.length}`, name: deviceForm.name.trim(), category: deviceForm.category,
      room: deviceForm.room.trim(), ip: deviceForm.ip.trim(), firmware: deviceForm.firmware.trim() || 'Not provided',
      online: deviceForm.online === 'Online',
      seen: deviceForm.online === 'Online' ? 'Just now' : 'No recent check-in',
      trust: 'Unknown',
    };
    setDevices(current => [newDevice, ...current]);
    setDeviceForm({ name: '', category: 'Camera', room: '', ip: '', firmware: '', online: 'Online' });
    setFormError('');
    setShowAddDevice(false);
    notify(`${newDevice.name} added to simulated devices`);
  }
  function clearDeviceFilters() {
    setSearch(''); setDeviceFilter('All devices'); setTypeFilter('All types');
    setOnlineFilter('All statuses'); setTrustFilter('All trust states');
  }
  function updateAlert(id: string, kind: 'acknowledged' | 'resolved') {
    setAlerts(current => current.map(a => a.id === id ? { ...a, [kind]: true, ...(kind === 'resolved' ? { acknowledged: true } : {}) } : a));
    notify(kind === 'resolved' ? 'Alert dismissed' : 'Alert acknowledged');
  }
  function recordUnauthorizedFaceResult(result: FaceRecognitionResult) {
    const modeLabel = result.source === 'demo' ? 'Simulated demo outcome' : 'Recognition service result';
    setAlerts(current => [{
      id: `face-${Date.now()}`,
      severity: 'Critical',
      title: result.source === 'demo' ? 'Face recognition demo: unauthorised preview' : 'Unauthorised face recognition result',
      device: 'Face recognition',
      description: `${modeLabel}. ${result.reason}`,
      time: 'Just now',
      resolved: false,
      acknowledged: false,
    }, ...current]);
  }
  const navItems = [
    { title: 'Overview', icon: House }, { title: 'Devices', icon: Wifi, count: devices.length },
    { title: 'Security Events', icon: Bell, count: activeCount },
    { title: 'AI Face Recognition', icon: ScanFace },
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
          {navItems.map(({ title, icon: Icon, count }) => <button key={title} className={`nav-item ${activeNav === title ? 'selected' : ''}`} onClick={() => setLocation(title === 'Devices' ? '/devices' : title === 'Security Events' ? '/security-events' : title === 'AI Face Recognition' ? '/face-recognition' : '/')} data-testid={`nav-${title.toLowerCase().replaceAll(' ', '-')}`} aria-current={activeNav === title ? 'page' : undefined}>
            <Icon size={17} strokeWidth={1.8} /><span>{title}</span>{count !== undefined && <span className="nav-count">{count}</span>}
          </button>)}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-tip"><div className="tip-icon"><CircleHelp size={16} /></div><strong>Simulation only</strong><p>Sample device activity only. This app does not monitor real Wi-Fi.</p><button onClick={() => notify('Hearthguard is a frontend simulation; no real network is monitored.')} data-testid="button-security-tips">About this demo <span>↗</span></button></div>
          <div className="profile"><div className="profile-avatar">JM</div><div><strong>Jamie Morgan</strong><span>Homeowner</span></div><MoreHorizontal size={18} /></div>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div className="breadcrumb"><span>Willow Creek</span><span className="crumb-slash">/</span><strong>{activeNav}</strong></div>
          <div className="topbar-actions"><span className="updated"><span className="live-dot" />Simulation data</span><button className="icon-button" aria-label="Open security events" onClick={() => setLocation('/security-events')} data-testid="button-notifications"><Bell size={18} /><i /></button><div className="top-avatar">JM</div></div>
        </header>
        <nav className="mobile-nav" aria-label="Dashboard sections">
          {navItems.map(({ title, icon: Icon, count }) => <button key={title} className={activeNav === title ? 'current' : ''} onClick={() => setLocation(title === 'Devices' ? '/devices' : title === 'Security Events' ? '/security-events' : title === 'AI Face Recognition' ? '/face-recognition' : '/')} data-testid={`mobile-nav-${title.toLowerCase().replaceAll(' ', '-')}`} aria-current={activeNav === title ? 'page' : undefined}><Icon size={15} /><span>{title}</span>{count !== undefined && <i>{count}</i>}</button>)}
        </nav>

        <div className="dashboard">
          {activeNav === 'Devices' ? <section className="page-screen">
            <div className="welcome-row page-welcome"><div><div className="eyebrow"><span className="eyebrow-line" />YOUR CONNECTED HOME <span className="simulation-badge">SIMULATED DATA</span></div><h1>Devices, <em>at a glance.</em></h1><p className="welcome-sub">A local sample inventory for Willow Creek. No real Wi-Fi is monitored.</p></div><button className="primary-action" onClick={() => { setFormError(''); setShowAddDevice(true); }} data-testid="button-add-device"><Plus size={15} /> Add device</button></div>
            <div className="device-summary-strip"><span><strong>{devices.length}</strong> devices in this sample</span><span><i className="online-mark" />{devices.filter(d => d.online).length} online</span><span><i className="offline-mark" />{devices.filter(d => !d.online).length} offline</span><span><ShieldCheck size={13} />{trustedCount} trusted</span></div>
            <section className="surface full-device-surface">
              <div className="section-heading"><div><div className="section-kicker">INVENTORY</div><h2>All devices <span className="heading-count">{filteredInventory.length}</span></h2></div><button className={`filter-button ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters} data-testid="button-device-filters"><SlidersHorizontal size={15} /> {showFilters ? 'Hide filters' : 'Filters'} {(typeFilter !== 'All types' || onlineFilter !== 'All statuses' || trustFilter !== 'All trust states') && <span className="filter-indicator" />}</button></div>
              <div className="device-toolbar full-device-toolbar">
                <label className="search-field"><Search size={15} /><input type="search" aria-label="Search devices" placeholder="Search name, room, or IP..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-device-search" /></label>
                {showFilters && <>
                <label className="select-wrap"><select aria-label="Filter by device type" value={typeFilter} onChange={e => setTypeFilter(e.target.value)} data-testid="select-device-type"><option>All types</option>{Array.from(new Set(devices.map(d => d.category))).sort().map(category => <option key={category}>{category}</option>)}</select><ChevronDown size={13} /></label>
                <label className="select-wrap"><select aria-label="Filter by online status" value={onlineFilter} onChange={e => setOnlineFilter(e.target.value)} data-testid="select-device-status"><option>All statuses</option><option>Online</option><option>Offline</option></select><ChevronDown size={13} /></label>
                <label className="select-wrap"><select aria-label="Filter by trust status" value={trustFilter} onChange={e => setTrustFilter(e.target.value)} data-testid="select-device-trust"><option>All trust states</option><option>Trusted</option><option>Unknown</option><option>Restricted</option></select><ChevronDown size={13} /></label>
                </>}
              </div>
              {(search || typeFilter !== 'All types' || onlineFilter !== 'All statuses' || trustFilter !== 'All trust states') && <div className="filter-note full-filter-note"><span>Filtered inventory</span><button onClick={clearDeviceFilters} data-testid="button-clear-device-filters">Clear all</button></div>}
              <div className="device-table full-device-table">
                <div className="device-table-head"><span>DEVICE / TYPE</span><span>ROOM</span><span>IP ADDRESS</span><span>STATUS</span><span>TRUST</span><span>LAST SEEN</span></div>
                {filteredInventory.length ? filteredInventory.map(device => <article className={`device-row full-device-row ${device.quarantined ? 'quarantined' : ''}`} key={device.id} data-testid={`device-row-${device.id}`}>
                  <div className="device-name-cell">{deviceGlyph(device.category)}<div className="device-title-wrap"><strong>{device.name}</strong><span>{device.category} · {device.firmware}</span></div></div>
                  <div className="device-room">{device.room}</div><div className="ip-cell" data-testid={`device-ip-${device.id}`}>{device.ip}</div>
                  <div><span className={`connection-state ${device.online ? 'is-online' : 'is-offline'}`} data-testid={`device-online-${device.id}`}><i />{device.online ? 'Online' : 'Offline'}</span></div>
                  <label className="trust-control"><span className="sr-only">Trust status for {device.name}</span><select value={device.trust} onChange={e => updateTrust(device.id, e.target.value as Device['trust'])} data-testid={`select-trust-${device.id}`}><option>Trusted</option><option>Unknown</option><option>Restricted</option></select><ChevronDown size={12} /></label>
                  <div className="last-seen" data-testid={`device-seen-${device.id}`}>{device.seen}</div>
                </article>) : <div className="empty-state"><div className="empty-icon"><Search size={19} /></div><strong>No devices match these filters</strong><span>Try another search or clear one of the filters.</span><button onClick={clearDeviceFilters} data-testid="button-reset-device-search">Clear filters</button></div>}
              </div>
              <div className="table-footer"><span>Showing <strong>{filteredInventory.length}</strong> of {devices.length} devices</span><span>Demo inventory · in-memory only</span></div>
            </section>
            <p className="simulation-disclaimer"><Shield size={14} /> Simulation only. These fictional sample values do not monitor or connect to your real Wi-Fi.</p>
          </section> : activeNav === 'Security Events' ? <section className="page-screen">
            <div className="welcome-row page-welcome"><div><div className="eyebrow"><span className="eyebrow-line" />DEVICE & NETWORK SECURITY <span className="simulation-badge">SIMULATED DATA</span></div><h1>Security <em>events.</em></h1><p className="welcome-sub">A timeline of sample detections and the reason each was flagged.</p></div><div className="event-total"><span>{alerts.length.toString().padStart(2, '0')}</span><small>SIMULATED EVENTS</small></div></div>
            <div className="event-safety-note"><ShieldCheck size={16} /><span><strong>Simulation only.</strong> This timeline is derived from fictional demo alerts. It does not monitor real Wi-Fi or process network data.</span></div>
            <div className="events-toolbar"><label className="select-wrap alert-select"><select aria-label="Filter events by severity" value={severityFilter} onChange={e => setSeverityFilter(e.target.value)} data-testid="select-event-severity"><option>All severity</option><option>Critical</option><option>High</option><option>Medium</option></select><ChevronDown size={13} /></label><div className="state-tabs"><button className={eventState === 'Active' ? 'current' : ''} onClick={() => setEventState('Active')} data-testid="button-events-active">Active <span>{activeCount}</span></button><button className={eventState === 'Resolved' ? 'current' : ''} onClick={() => setEventState('Resolved')} data-testid="button-events-resolved">Resolved</button><button className={eventState === 'All events' ? 'current' : ''} onClick={() => setEventState('All events')} data-testid="button-events-all">All events</button></div></div>
            <div className="event-timeline">
              {filteredEvents.length ? filteredEvents.map((alert, index) => <article className={`event-record ${alert.resolved ? 'is-resolved' : ''}`} key={alert.id} data-testid={`event-record-${alert.id}`}>
                <div className={`event-rail ${levelClass(alert.severity)}`}><span /></div>
                <div className="event-main"><div className="alert-meta"><span className={`severity ${levelClass(alert.severity)}`}><i />{alert.severity} SEVERITY</span><span className="alert-time"><Clock3 size={12} />{alert.time}</span></div><h2>{alert.title}</h2><p className="event-reason"><strong>Reason for detection</strong>{alert.description}</p><div className="event-device-line"><Wifi size={13} /><span>Affected device</span><strong>{alert.device}</strong></div>
                  {alert.resolved ? <div className="resolved-label"><CheckCircle2 size={13} /> Resolved</div> : <div className="alert-actions">{!alert.acknowledged && <button className="ack-button" onClick={() => updateAlert(alert.id, 'acknowledged')} data-testid={`button-acknowledge-${alert.id}`}>Acknowledge</button>}{alert.acknowledged && <span className="acknowledged-label"><Check size={12} /> Acknowledged</span>}<button className="dismiss-button" onClick={() => updateAlert(alert.id, 'resolved')} data-testid={`button-dismiss-${alert.id}`}>Resolve event</button></div>}
                </div><span className="event-index">{String(index + 1).padStart(2, '0')}</span>
              </article>) : <div className="empty-state event-empty"><div className="empty-icon calm"><CheckCircle2 size={20} /></div><strong>{eventState === 'Resolved' ? 'No resolved events yet' : 'No events match'}</strong><span>Change the severity or event status filter.</span><button onClick={() => { setSeverityFilter('All severity'); setEventState('All events'); }} data-testid="button-reset-event-filters">Reset filters</button></div>}
            </div>
          </section> : activeNav === 'AI Face Recognition' ? <FaceRecognitionPage
            demoMode={isFaceRecognitionDemoMode}
            alerts={alerts.slice(0, 3)}
            onAnalyze={recognizeFace}
            onUnauthorized={recordUnauthorizedFaceResult}
          /> : <>
          <section className="welcome-row">
            <div><div className="eyebrow"><span className="eyebrow-line" />{todayLabel}<span className="simulation-badge">SIMULATED DATA</span></div><h1>Your home, <em>in good hands.</em></h1><p className="welcome-sub">A clear view of what’s connected and what needs your attention.</p></div>
            <button className="secondary-button" onClick={() => notify('Sample dashboard values are up to date.')} data-testid="button-refresh"><Activity size={15} />Refresh sample <span className="refresh-time">· simulated</span></button>
          </section>

          <section className="posture-panel" aria-label="Security posture">
            <div className="posture-main">
              <div className="posture-topline"><div className="posture-icon"><ShieldAlert size={20} /></div><span className="posture-label">SECURITY POSTURE</span><span className="posture-date">TODAY, 9:41 AM</span></div>
              <div className="posture-title"><h2>Needs a closer look</h2><span className="status-pip" /></div>
              <p>One device is flagged in this fictional sample scenario. Review the details at your own pace.</p>
              <button className="posture-link" onClick={() => setLocation('/security-events')} data-testid="button-review-alert">Review security events <span>→</span></button>
            </div>
            <div className="posture-visual" aria-hidden="true">
              <div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="orbit-core"><House size={29} strokeWidth={1.5} /></div>
              <div className="orbit-node node-one"><Check size={13} /></div><div className="orbit-node node-two"><Wifi size={13} /></div><div className="orbit-node node-three"><Shield size={13} /></div>
              <div className="visual-caption">SIMULATED <span>●</span> SAMPLE DATA</div>
            </div>
            <div className="posture-stats">
              <div className="posture-stat"><span>CONNECTED DEVICES</span><strong>{devices.length.toString().padStart(2, '0')}</strong><small><ArrowUpRight size={12} /> 2 added this month</small></div>
              <div className="stat-divider" />
              <div className="posture-stat"><span>TRUSTED DEVICES</span><strong>{trustedCount.toString().padStart(2, '0')}<i>/{devices.length.toString().padStart(2, '0')}</i></strong><small className="mint"><CheckCircle2 size={12} /> {devices.length - trustedCount} need a look</small></div>
              <div className="stat-divider" />
              <div className="posture-stat"><span>OPEN ALERTS</span><strong>{activeCount.toString().padStart(2, '0')}</strong><small className="amber"><AlertTriangle size={12} /> {highPriorityCount} high priority</small></div>
            </div>
          </section>

          <section className="face-feature-callout" aria-label="Face recognition feature">
            <div className="face-feature-icon"><ScanFace size={19} /></div>
            <div className="face-feature-copy"><span>OPTIONAL IDENTITY CHECK</span><h2>AI Face Recognition <i>PREVIEW</i></h2><p>Upload an image or use your camera to explore the face-recognition workflow. Demo results are not real identity checks.</p></div>
            <button onClick={() => setLocation('/face-recognition')} data-testid="button-open-face-recognition"><ScanFace size={15} /> Open face recognition <span aria-hidden="true">→</span></button>
          </section>

          <div className="content-grid">
            <section className="surface devices-surface" id="devices">
              <div className="section-heading"><div><div className="section-kicker">YOUR CONNECTED HOME</div><h2>Devices <span className="heading-count">{devices.length}</span></h2></div><button className={`filter-button ${showFilters ? 'active' : ''}`} onClick={() => setShowFilters(!showFilters)} data-testid="button-device-filters"><SlidersHorizontal size={15} /> Filters {deviceFilter !== 'All devices' && <span className="filter-indicator" />}</button></div>
              <div className="device-toolbar">
                <label className="search-field"><Search size={15} /><input type="search" placeholder="Find a device..." value={search} onChange={e => setSearch(e.target.value)} data-testid="input-device-search" /><kbd>⌘ K</kbd></label>
                <label className="select-wrap"><Filter size={13} /><select aria-label="Filter devices by trust status" value={deviceFilter} onChange={e => setDeviceFilter(e.target.value)} data-testid="select-device-filter"><option>All devices</option><option>Needs attention</option><option>Trusted</option><option>Unknown</option><option>Restricted</option></select><ChevronDown size={13} /></label>
              </div>
              {showFilters && <div className="filter-note"><span>Showing:</span> {deviceFilter} <button onClick={() => { setDeviceFilter('All devices'); setSearch(''); }} data-testid="button-clear-device-filters">Clear filters</button></div>}
              <div className="device-table">
                <div className="device-table-head"><span>DEVICE</span><span>ROOM</span><span>TRUST STATUS</span><span>LAST SEEN</span><span /></div>
                {filteredDevices.length ? filteredDevices.map(device => <div className={`device-row ${device.quarantined ? 'quarantined' : ''}`} key={device.id} data-testid={`device-row-${device.id}`}>
                  <div className="device-name-cell">{deviceGlyph(device.category)}<div className="device-title-wrap"><strong>{device.name}</strong><span>{device.category} <b>·</b> {device.ip}</span></div></div>
                  <div className="device-room">{device.room}</div>
                  <div><span className={`trust-badge ${device.trust.toLowerCase()}`}><span />{device.trust}</span></div>
                  <div className="last-seen">{device.seen}</div>
                  <div className="device-action"><button className={`quarantine-button ${device.quarantined ? 'restore' : ''}`} onClick={() => quarantine(device)} data-testid={`button-quarantine-${device.id}`}>{device.quarantined ? 'Restore' : 'Quarantine'}</button></div>
                </div>) : <div className="empty-state"><div className="empty-icon"><Search size={19} /></div><strong>No devices match</strong><span>Try a different name or trust filter.</span><button onClick={() => { setSearch(''); setDeviceFilter('All devices'); }} data-testid="button-reset-device-search">Clear search</button></div>}
              </div>
              <div className="table-footer"><span>Showing <strong>{filteredDevices.length}</strong> of {devices.length} devices</span><span>Simulated sample inventory</span></div>
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
              <div className="alerts-footer"><span><Siren size={13} /> Simulated security events</span><button onClick={() => setLocation('/security-events')} data-testid="button-view-all-alerts">View all events <span>→</span></button></div>
            </section>
          </div>

          <footer className="dashboard-footer"><div><div className="footer-shield"><ShieldCheck size={16} /></div><span><strong>Simulation only.</strong> Fictional sample values; this app does not monitor real Wi-Fi.</span></div><button onClick={() => notify('No real network is monitored and no data leaves this browser session.')} data-testid="button-privacy-details">About this simulation <ArrowDownRight size={13} /></button></footer>
          </>}
        </div>
      </main>
      {showAddDevice && <div className="dialog-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowAddDevice(false); }}>
        <section className="add-device-dialog" role="dialog" aria-modal="true" aria-labelledby="add-device-title">
          <div className="dialog-heading"><div><span className="section-kicker">SIMULATED INVENTORY</span><h2 id="add-device-title">Add a device</h2></div><button className="icon-button" aria-label="Close add device form" onClick={() => setShowAddDevice(false)} data-testid="button-close-add-device"><X size={17} /></button></div>
          <p className="dialog-intro">Add fictional sample details to the in-memory device list.</p>
          <form onSubmit={addDevice} className="add-device-form">
            <label>Device name<input required maxLength={48} value={deviceForm.name} onChange={e => setDeviceForm({ ...deviceForm, name: e.target.value })} placeholder="e.g. Garage motion sensor" data-testid="input-new-device-name" /></label>
            <div className="form-pair"><label>Device type<select value={deviceForm.category} onChange={e => setDeviceForm({ ...deviceForm, category: e.target.value })} data-testid="select-new-device-type"><option>Camera</option><option>Smart lock</option><option>Climate</option><option>Network</option><option>Speaker</option><option>Sensor</option></select></label><label>Room<input required maxLength={36} value={deviceForm.room} onChange={e => setDeviceForm({ ...deviceForm, room: e.target.value })} placeholder="e.g. Garage" data-testid="input-new-device-room" /></label></div>
            <label>Connection status<select value={deviceForm.online} onChange={e => setDeviceForm({ ...deviceForm, online: e.target.value })} data-testid="select-new-device-status"><option>Online</option><option>Offline</option></select></label>
            <label>IP address<input required inputMode="decimal" value={deviceForm.ip} onChange={e => { setDeviceForm({ ...deviceForm, ip: e.target.value }); setFormError(''); }} placeholder="192.168.1.90" data-testid="input-new-device-ip" aria-describedby={formError ? 'device-form-error' : undefined} /></label>
            <label>Firmware <span className="optional-label">OPTIONAL</span><input maxLength={24} value={deviceForm.firmware} onChange={e => setDeviceForm({ ...deviceForm, firmware: e.target.value })} placeholder="e.g. v1.2.0" data-testid="input-new-device-firmware" /></label>
            {formError && <p className="form-error" id="device-form-error" role="alert" data-testid="text-device-form-error">{formError}</p>}
            <div className="dialog-actions"><button type="button" className="dialog-cancel" onClick={() => setShowAddDevice(false)} data-testid="button-cancel-add-device">Cancel</button><button type="submit" className="primary-action" data-testid="button-submit-add-device"><Plus size={14} /> Add device</button></div>
          </form>
        </section>
      </div>}
      {toast && <div role="status" className="toast-message"><CheckCircle2 size={16} />{toast}<button aria-label="Dismiss notification" onClick={() => setToast('')}><X size={15} /></button></div>}
    </div>
  );
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <Home />
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
