import { BrokerOption } from '../types';

export interface SyncplayServer {
  id: string;
  brokerId: number;
  name: string;
  host: string;
  port: number;
  region: string;
  status: 'recommended' | 'active' | 'backup';
  description: string;
}

export const APP_BROKERS: BrokerOption[] = [
  {
    id: 0,
    name: 'Official Default',
    label: '🌐 Official Syncplay (syncplay.pl:8999)',
    url: 'syncplay.pl:8999',
    serverHost: 'syncplay.pl',
    serverPort: 8999,
    roomNamespace: 'official',
    badge: 'Default',
    region: '🌐 Global Default',
  },
  {
    id: 1,
    name: 'Official EU',
    label: '🇫🇷 Syncplay EU (syncplay.pl:8995)',
    url: 'syncplay.pl:8995',
    serverHost: 'syncplay.pl',
    serverPort: 8995,
    roomNamespace: 'eu',
    badge: '8995',
    region: '🇫🇷 Europe',
  },
  {
    id: 2,
    name: 'Official Fallback',
    label: '⚡ Syncplay Fallback (syncplay.pl:8996)',
    url: 'syncplay.pl:8996',
    serverHost: 'syncplay.pl',
    serverPort: 8996,
    roomNamespace: 'fallback',
    badge: '8996',
    region: '⚡ Low Latency',
  },
  {
    id: 3,
    name: 'Official Alt',
    label: '🚀 Syncplay Alt (syncplay.pl:8997)',
    url: 'syncplay.pl:8997',
    serverHost: 'syncplay.pl',
    serverPort: 8997,
    roomNamespace: 'alt',
    badge: '8997',
    region: '🚀 High Bandwidth',
  },
  {
    id: 4,
    name: 'Official Germany',
    label: '🇩🇪 German Syncplay (de.syncplay.pl:8999)',
    url: 'de.syncplay.pl:8999',
    serverHost: 'de.syncplay.pl',
    serverPort: 8999,
    roomNamespace: 'de',
    badge: 'DE 8999',
    region: '🇩🇪 Germany',
  },
  {
    id: 5,
    name: 'Custom Server',
    label: '🔧 Custom Syncplay Host',
    url: 'custom-host:8999',
    serverHost: 'custom-host',
    serverPort: 8999,
    roomNamespace: 'custom',
    badge: 'Custom',
    region: 'Manual',
  },
];

export const SYNCPLAY_SERVERS: SyncplayServer[] = [
  {
    id: 'official-8999',
    brokerId: 0,
    name: 'Syncplay Default (8999)',
    host: 'syncplay.pl',
    port: 8999,
    region: '🌐 Global Default',
    status: 'recommended',
    description: 'Official public Syncplay server for room sync and playback coordination.',
  },
  {
    id: 'official-8995',
    brokerId: 1,
    name: 'Syncplay EU (8995)',
    host: 'syncplay.pl',
    port: 8995,
    region: '🇫🇷 Europe',
    status: 'active',
    description: 'Official public server commonly used for synchronized playback rooms.',
  },
  {
    id: 'official-8996',
    brokerId: 2,
    name: 'Syncplay Fallback (8996)',
    host: 'syncplay.pl',
    port: 8996,
    region: '⚡ Low Latency',
    status: 'recommended',
    description: 'Alternative official Syncplay endpoint for room coordination.',
  },
  {
    id: 'official-8997',
    brokerId: 3,
    name: 'Syncplay Alt (8997)',
    host: 'syncplay.pl',
    port: 8997,
    region: '🚀 High Bandwidth',
    status: 'active',
    description: 'Additional official public Syncplay room server.',
  },
  {
    id: 'official-de-8999',
    brokerId: 4,
    name: 'Syncplay Germany (DE 8999)',
    host: 'de.syncplay.pl',
    port: 8999,
    region: '🇩🇪 Frankfurt',
    status: 'recommended',
    description: 'German public Syncplay endpoint for regional rooms.',
  },
];
