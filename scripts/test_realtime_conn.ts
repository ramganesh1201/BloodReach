import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://127.0.0.1:54321';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

console.log('global WebSocket available:', typeof global.WebSocket);

const client = createClient(SUPABASE_URL, ANON_KEY);

console.log('Realtime endpoint:', (client.realtime as any).endPoint);

const channel = client.channel('test-channel');

channel.subscribe((status, err) => {
  console.log('Subscription status:', status, err || '');
  if (status === 'SUBSCRIBED') {
    console.log('Successfully subscribed to channel!');
    client.removeChannel(channel).then(() => {
      console.log('Channel removed cleanly.');
      process.exit(0);
    });
  }
});

setTimeout(() => {
  console.log('Timed out waiting for subscribe event.');
  process.exit(1);
}, 6000);

