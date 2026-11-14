// Levels. Each level has two scenes that share one simulator run shape:
// a coffee shop first, then the same diagram as software.
// The simulator always runs in software units; the cafe scene shows them divided by SCALE
// (1 customer = 50 requests) with one tick read as a minute instead of a second.

const PRIMER = 'https://github.com/donnemartin/system-design-primer';
const SCALE = 50;

const LEVELS = [
  {
    id: 'l1', n: 1, name: 'Morning rush', concept: 'Saturation',
    reading: { label: 'Latency vs throughput', url: PRIMER + '#latency-vs-throughput' },
    translate: [
      ['Barista', 'Server'], ['The line', 'Queue'], ['Customers a minute', 'Requests a second'], ['50 minutes', '50 seconds']
    ],
    design: {
      traffic: { x: 30, y: 150 },
      blocks: [{ id: 's1', type: 'server', names: { cafe: 'Barista', software: 'Web server' }, capacity: 100, copies: 1, queueLimit: 5000, x: 360, y: 150 }],
      wires: [['traffic', 's1']]
    },
    scenes: {
      cafe: {
        title: 'The 8:00 train',
        brief: 'One barista makes 2 drinks a minute. Normally 1.2 customers walk in each minute. At 8:00 a commuter train pulls in, and for 20 minutes 4 customers arrive every minute.',
        goal: 'Keep nearly everyone’s wait under 5 minutes, for $50 an hour or less.',
        predict: { key: 'recoverySeconds', scale: 1, question: 'The rush ends at 8:20. How many minutes until the line is gone?', unit: 'min' },
        hints: [
          'For 20 minutes, 4 people arrived each minute and only 2 got served. How long is the line at 8:20?',
          'A line shrinks only as fast as the spare capacity: drinks per minute minus customers per minute. That spare is called headroom.',
          'Look at the barista. With 0.8 drinks a minute of headroom, a 40-person line takes 50 minutes. What speed would stop the line forming at all?'
        ],
        scenario: {
          duration: 150, base: { reads: 60, writes: 0 }, spike: { t: 30, dur: 20, reads: 200, writes: 0 },
          latencyTargetMs: 5000, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.25 }
        }
      },
      software: {
        title: 'A post goes viral',
        brief: 'One server handles 100 requests a second. Normal traffic is 60 a second. At 0:30 a post goes viral and traffic jumps to 200 a second for 20 seconds.',
        goal: 'Keep slow requests under 5% for $0.25 an hour or less.',
        predict: { key: 'recoverySeconds', scale: 1, question: 'The spike ends at 0:50. How many seconds until the queue is empty?', unit: 's' },
        hints: [
          'This is the coffee shop with different units. What did the line do after the train left?',
          'Headroom is capacity minus normal load. A queue drains at the speed of the headroom.',
          'Look at Web server: 40 requests a second of headroom against a 2,000-request queue.'
        ],
        scenario: {
          duration: 150, base: { reads: 60, writes: 0 }, spike: { t: 30, dur: 20, reads: 200, writes: 0 },
          latencyTargetMs: 200, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.25 }
        }
      }
    }
  },
  {
    id: 'l2', n: 2, name: 'Sick day', concept: 'Redundancy',
    reading: { label: 'Load balancer', url: PRIMER + '#load-balancer', extra: { label: 'Availability patterns', url: PRIMER + '#availability-patterns' } },
    translate: [
      ['Shared line', 'Load balancer'], ['Baristas', 'Server copies'], ['Barista goes home sick', 'A copy crashes'], ['Walk-outs', 'Dropped requests']
    ],
    design: {
      traffic: { x: 30, y: 150 },
      blocks: [
        { id: 'lb1', type: 'loadBalancer', names: { cafe: 'Shared line', software: 'Load balancer' }, x: 260, y: 150 },
        { id: 's1', type: 'server', names: { cafe: 'Baristas', software: 'App servers' }, capacity: 100, copies: 3, queueLimit: 200, x: 500, y: 150 }
      ],
      wires: [['traffic', 'lb1'], ['lb1', 's1']]
    },
    scenes: {
      cafe: {
        title: 'One barista calls in sick',
        brief: 'Three baristas each make 2 drinks a minute, and 4.8 customers walk in every minute. At 8:10 one barista goes home sick for an hour. Customers leave if more than 4 people are already waiting.',
        goal: 'Lose fewer than 1% of customers, for $100 an hour or less.',
        predict: { key: 'peakErrorRate', scale: 1, question: 'In the worst minute, what share of customers walk out?', unit: '%' },
        hints: [
          'With two baristas left, how many drinks a minute can the shop make? How does that compare with 4.8 customers?',
          'Keeping one more barista than you need, so a sick day still covers the morning, is called N+1.',
          'Look at the baristas. Two of them make 4 drinks a minute, so 0.8 customers a minute find the line full and leave.'
        ],
        scenario: {
          duration: 150, base: { reads: 200, writes: 40 }, serverFail: { t: 40, dur: 60 },
          latencyTargetMs: 5000, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.5 }
        }
      },
      software: {
        title: 'One copy crashes',
        brief: 'A load balancer sits in front of three copies of a server, each handling 100 requests a second. Traffic is 240 a second. At 0:40 one copy crashes for 60 seconds.',
        goal: 'Keep errors under 1% through the crash, for $0.50 an hour or less.',
        predict: { key: 'peakErrorRate', scale: 1, question: 'At the worst second, what share of requests fail?', unit: '%' },
        hints: [
          'This is the sick day again. How much capacity is left when one copy is gone?',
          'Redundancy: enough spare copies that losing one still covers the load.',
          'Look at App servers: two copies serve 200 a second against 240 arriving.'
        ],
        scenario: {
          duration: 150, base: { reads: 200, writes: 40 }, serverFail: { t: 40, dur: 60 },
          latencyTargetMs: 300, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.5 }
        }
      }
    }
  },
  {
    id: 'l3', n: 3, name: 'Fridge sells out', concept: 'Caching',
    reading: { label: 'Cache', url: PRIMER + '#cache' },
    translate: [
      ['Grab-and-go fridge', 'Cache'], ['Espresso machine', 'Database'], ['Extra espresso machine', 'Read replica'], ['Fridge sells out', 'Cache flush']
    ],
    design: {
      traffic: { x: 20, y: 160 },
      blocks: [
        { id: 's1', type: 'server', names: { cafe: 'Register', software: 'App server' }, capacity: 1200, copies: 1, queueLimit: 2000, x: 230, y: 160 },
        { id: 'c1', type: 'cache', names: { cafe: 'Grab-and-go fridge', software: 'Cache' }, size: 'medium', x: 460, y: 50 },
        { id: 'db1', type: 'database', names: { cafe: 'Espresso machine', software: 'Database' }, readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, x: 690, y: 210 }
      ],
      wires: [['traffic', 's1'], ['s1', 'c1'], ['c1', 'db1'], ['s1', 'db1']]
    },
    scenes: {
      cafe: {
        title: 'The fridge sells out',
        brief: '20 customers a minute. 90% grab a bottled cold brew from the fridge; the rest order from the espresso machine, which makes 6 drinks a minute. At 8:10 the fridge sells out, and restocking takes 30 minutes.',
        goal: 'Lose fewer than 1% of customers and keep waits under 5 minutes, for $500 an hour or less.',
        predict: { key: 'dbReadLoadAfterFlush', scale: SCALE, question: 'The minute the fridge is empty, how many customers a minute queue at the espresso machine?', unit: '/min' },
        hints: [
          'Before 8:10, 1 in 10 customers needed the espresso machine. How many need it once the fridge is empty?',
          'When the shortcut disappears, everyone hits the slow path at once. In software this is a cache stampede.',
          'Look at the espresso machine: 20 orders a minute against 6. More machines add drinks per minute.'
        ],
        scenario: {
          duration: 150, base: { reads: 1000, writes: 0 }, cacheFlush: { t: 40, warm: 30 },
          latencyTargetMs: 5000, targets: { errorRate: 0.01, slowShare: 0.05, cost: 2.5 }
        }
      },
      software: {
        title: 'The cache restarts empty',
        brief: '1,000 reads a second, and a cache that answers 90% of them. The database handles 300 reads a second. At 0:40 the cache restarts empty and takes 30 seconds to warm up.',
        goal: 'Keep errors under 1% and slow requests under 5%, for $2.50 an hour or less.',
        predict: { key: 'dbReadLoadAfterFlush', scale: 1, question: 'In the second after the restart, how many reads a second reach the database?', unit: 'req/s' },
        hints: [
          'This is the empty fridge. What share of reads miss the cache in the first second?',
          'A cold cache sends every read to the database at once. It has to survive the warm-up, not just normal load.',
          'Look at Database: 1,000 reads a second against 300. Read replicas add read capacity.'
        ],
        scenario: {
          duration: 150, base: { reads: 1000, writes: 0 }, cacheFlush: { t: 40, warm: 30 },
          latencyTargetMs: 200, targets: { errorRate: 0.01, slowShare: 0.05, cost: 2.5 }
        }
      }
    }
  }
];

export { LEVELS, SCALE };
