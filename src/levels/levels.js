// Levels. Each level has two scenes that share one simulator run shape:
// a coffee shop first, then the same diagram as software.
// The simulator always runs in software units; the cafe scene shows them divided by SCALE
// (1 customer = 50 requests) with one tick read as a minute instead of a second.
//
// `design` is the reference broken design the tests use. The board starts from `starter`,
// which holds only what the learner is given. `tests` are hidden mornings that Submit runs
// after the sample scenario; each changes the sample's shocks and gives the same verdict in both scenes.
// One hidden test is always the worst corner of the constraints: the simulator is monotone (more traffic or a
// longer outage never shortens a line), so a design that survives it survives every easier morning.
// `map` is the survival map (see survival.js): the two knobs of the Constraints that matter, in software
// units, swept from easy to hard. Everything else is held at its worst (`fixed`).

const PRIMER = 'https://github.com/donnemartin/system-design-primer';
const SCALE = 50;

const LEVELS = [
  {
    id: 'l1', n: 1, name: 'Morning rush', concept: 'Saturation', difficulty: 'Easy',
    map: { x: { dim: 'spikeDur', from: 10, to: 40, step: 2 }, y: { dim: 'spikeLoad', from: 100, to: 240, step: 10 }, fixed: { base: 60, spikeT: 30 } },
    reading: { label: 'Latency vs throughput', url: PRIMER + '#latency-vs-throughput' },
    translate: [
      ['Barista', 'Server'], ['The line', 'Queue'], ['Customers a minute', 'Requests a second'], ['50 minutes', '50 seconds']
    ],
    design: {
      traffic: { x: 30, y: 150 },
      blocks: [{ id: 's1', type: 'server', names: { cafe: 'Barista', software: 'Web server' }, capacity: 100, copies: 1, queueLimit: 5000, x: 360, y: 150 }],
      wires: [['traffic', 's1']]
    },
    tests: [
      { id: 'quiet', name: { cafe: 'A rainy Tuesday', software: 'A quiet day' }, story: { cafe: 'Only 0.8 customers a minute, and no train.', software: '40 requests a second and no spike.' }, change: { base: { reads: 40, writes: 0 }, spike: null } },
      { id: 'two-trains', name: { cafe: 'Two trains at once', software: 'A longer spike' }, story: { cafe: 'Two trains arrive together: 4.8 customers a minute for 40 minutes.', software: '240 requests a second for 40 seconds.' }, change: { spike: { t: 30, dur: 40, reads: 240, writes: 0 } } },
      { id: 'late-train', name: { cafe: 'The late train', software: 'A late spike' }, story: { cafe: 'The train runs late and pulls in at 9:00.', software: 'The spike starts at 1:30 instead of 0:30.' }, change: { spike: { t: 90, dur: 20, reads: 200, writes: 0 } } }
    ],
    scenes: {
      cafe: {
        title: 'The 8:00 train',
        brief: 'One barista makes 2 drinks a minute. Normally 1.2 customers walk in each minute. At 8:00 a commuter train pulls in, and for 20 minutes 4 customers arrive every minute.',
        goal: 'Keep nearly everyone’s wait under 5 minutes, for $50 an hour or less.',
        constraints: ['Normal mornings: 1.2 customers a minute.', 'A rush can reach 4.8 customers a minute and last up to 40 minutes.', 'A rush can come at any time before 9:00.', 'A barista costs $20 an hour for every 2 drinks a minute they make.'],
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
        constraints: ['Normal traffic: 60 requests a second.', 'A spike can reach 240 requests a second and last up to 40 seconds.', 'A spike can start at any time before 1:30.', 'A server costs $0.10 an hour per 100 requests a second of capacity.'],
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
    id: 'l2', n: 2, name: 'Sick day', concept: 'Redundancy', difficulty: 'Easy',
    map: { x: { dim: 'failDur', from: 10, to: 90, step: 5 }, y: { dim: 'base', from: 180, to: 280, step: 10 }, fixed: { failT: 10 } },
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
    starter: { traffic: { x: 30, y: 150 }, blocks: [], wires: [] },
    tests: [
      { id: 'slow-week', name: { cafe: 'A slow week', software: 'Low traffic' }, story: { cafe: 'Only 3.6 customers a minute, and still one barista out sick.', software: '180 requests a second, and still one copy crashes.' }, change: { base: { reads: 150, writes: 30 } } },
      { id: 'friday', name: { cafe: 'Busy Friday', software: 'Peak day' }, story: { cafe: '5.6 customers a minute all morning, and a barista goes home sick at 8:10.', software: '280 requests a second, and one copy crashes at 0:40.' }, change: { base: { reads: 230, writes: 50 } } },
      { id: 'worst', name: { cafe: 'Busy and short-handed', software: 'Peak day, long crash' }, story: { cafe: 'The worst morning in the brief: 5.6 customers a minute, and a barista calls in sick at 7:40 for 90 minutes.', software: 'The worst case in the constraints: 280 requests a second, and a copy crashes at 0:10 for 90 seconds.' }, change: { base: { reads: 230, writes: 50 }, serverFail: { t: 10, dur: 90 } } }
    ],
    scenes: {
      cafe: {
        title: 'One barista calls in sick',
        brief: 'Your shop is empty: hire it from scratch. 4.8 customers walk in every minute, and one barista makes 2 drinks a minute. At 8:10 one barista goes home sick for an hour. A shared line sends each customer to the next free barista.',
        goal: 'Lose fewer than 1% of customers, for $100 an hour or less.',
        constraints: ['Normal mornings: 4.8 customers a minute. Busy days reach 5.6.', 'One barista may be out sick for up to 90 minutes, starting as early as 7:40.', 'A barista costs $20 an hour for every 2 drinks a minute. A shared line costs $10 an hour.', 'Customers leave when the line at their barista is full.'],
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
        brief: 'Traffic is 240 requests a second, and each copy of a server handles 100. At 0:40 one copy crashes for 60 seconds. A load balancer spreads requests across the copies behind it.',
        goal: 'Keep errors under 1% through the crash, for $0.50 an hour or less.',
        constraints: ['Normal traffic: 240 requests a second. Peak days reach 280.', 'One copy may crash for up to 90 seconds, as early as 0:10.', 'A server costs $0.10 an hour per 100 requests a second, per copy. A load balancer costs $0.05.', 'Requests are dropped when a copy’s queue is full.'],
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
    id: 'l3', n: 3, name: 'Fridge sells out', concept: 'Caching', difficulty: 'Medium',
    map: { x: { dim: 'base', from: 900, to: 1100, step: 10 }, y: { dim: 'flush', from: 0, to: 1, step: 1 }, fixed: { flushT: 40 } },
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
    starter: {
      traffic: { x: 20, y: 160 },
      blocks: [{ id: 'db1', type: 'database', names: { cafe: 'Espresso machine', software: 'Database' }, readCapacity: 300, writeCapacity: 100, replicas: 0, queueLimit: 2000, x: 690, y: 210 }],
      wires: []
    },
    tests: [
      { id: 'stocked', name: { cafe: 'The fridge stays stocked', software: 'The cache stays warm' }, story: { cafe: 'Deliveries arrive on time all morning.', software: 'The cache never restarts.' }, change: { cacheFlush: null } },
      { id: 'worst', name: { cafe: 'A busy morning sells out', software: 'Peak traffic, cold cache' }, story: { cafe: 'The worst morning in the brief: 22 customers a minute, and the fridge sells out at 8:10.', software: 'The worst case in the constraints: 1,100 reads a second, and the cache restarts empty at 0:40.' }, change: { base: { reads: 1100, writes: 0 } } },
      { id: 'early-sellout', name: { cafe: 'Sold out by 7:40', software: 'An early restart' }, story: { cafe: 'The fridge sells out at 7:40 and takes 30 minutes to restock.', software: 'The cache restarts empty at 0:10 and warms up over 30 seconds.' }, change: { cacheFlush: { t: 10, warm: 30 } } }
    ],
    scenes: {
      cafe: {
        title: 'The fridge sells out',
        brief: 'You have an espresso machine that makes 6 drinks a minute. 20 customers come in each minute, and every customer pays at a barista first. A grab-and-go fridge of bottled cold brew could serve 9 in 10 of them. At 8:10 the fridge sells out, and restocking takes 30 minutes.',
        goal: 'Lose fewer than 1% of customers and keep waits under 5 minutes, for $550 an hour or less.',
        constraints: ['Normal mornings: 20 customers a minute. Busy mornings reach 22.', 'The fridge can sell out at any time; restocking takes 30 minutes.', 'An extra espresso machine adds 6 drinks a minute for $60 an hour.', 'A barista costs $20 an hour for every 2 customers a minute they serve.'],
        predict: { key: 'dbReadLoadAfterFlush', scale: SCALE, question: 'The minute the fridge is empty, how many customers a minute queue at the espresso machine?', unit: '/min' },
        hints: [
          'Before 8:10, 1 in 10 customers needed the espresso machine. How many need it once the fridge is empty?',
          'When the shortcut disappears, everyone hits the slow path at once. In software this is a cache stampede.',
          'Look at the espresso machine: 20 orders a minute against 6. More machines add drinks per minute.'
        ],
        scenario: {
          duration: 150, base: { reads: 1000, writes: 0 }, cacheFlush: { t: 40, warm: 30 },
          latencyTargetMs: 5000, targets: { errorRate: 0.01, slowShare: 0.05, cost: 2.75 }
        }
      },
      software: {
        title: 'The cache restarts empty',
        brief: 'You have a database that handles 300 reads a second. Traffic is 1,000 reads a second, and every request goes through an app server first. A cache could answer 90% of reads. At 0:40 the cache restarts empty and takes 30 seconds to warm up.',
        goal: 'Keep errors under 1% and slow requests under 5%, for $2.75 an hour or less.',
        constraints: ['Normal traffic: 1,000 reads a second. Busy days reach 1,100.', 'The cache can restart at any time; it takes 30 seconds to warm up.', 'A read replica adds 300 reads a second for $0.30 an hour.', 'A server costs $0.10 an hour per 100 requests a second.'],
        predict: { key: 'dbReadLoadAfterFlush', scale: 1, question: 'In the second after the restart, how many reads a second reach the database?', unit: 'req/s' },
        hints: [
          'This is the empty fridge. What share of reads miss the cache in the first second?',
          'A cold cache sends every read to the database at once. It has to survive the warm-up, not just normal load.',
          'Look at Database: 1,000 reads a second against 300. Read replicas add read capacity.'
        ],
        scenario: {
          duration: 150, base: { reads: 1000, writes: 0 }, cacheFlush: { t: 40, warm: 30 },
          latencyTargetMs: 200, targets: { errorRate: 0.01, slowShare: 0.05, cost: 2.75 }
        }
      }
    }
  },
  {
    id: 'l4', n: 4, name: 'Mobile orders', concept: 'Asynchronism', difficulty: 'Medium',
    map: { x: { dim: 'spikeDur', from: 10, to: 30, step: 2 }, y: { dim: 'spikeLoad', from: 100, to: 300, step: 10 }, fixed: { base: 60, spikeT: 30 }, noun: { cafe: 'app orders', software: 'writes' } },
    reading: { label: 'Asynchronism', url: PRIMER + '#asynchronism' },
    translate: [
      ['Ticket rail', 'Message queue'], ['Baristas pulling tickets', 'Workers'], ['An app order', 'A write'], ['Order refused', 'Dropped write']
    ],
    design: {
      traffic: { x: 30, y: 150 },
      blocks: [
        { id: 's1', type: 'server', names: { cafe: 'Order taker', software: 'App server' }, capacity: 300, copies: 1, queueLimit: 2000, x: 250, y: 150 },
        { id: 'db1', type: 'database', names: { cafe: 'Espresso machine', software: 'Database' }, readCapacity: 100, writeCapacity: 100, replicas: 0, queueLimit: 200, x: 690, y: 150 }
      ],
      wires: [['traffic', 's1'], ['s1', 'db1']]
    },
    starter: {
      traffic: { x: 30, y: 150 },
      blocks: [{ id: 'db1', type: 'database', names: { cafe: 'Espresso machine', software: 'Database' }, readCapacity: 100, writeCapacity: 100, replicas: 0, queueLimit: 200, x: 690, y: 150 }],
      wires: []
    },
    tests: [
      { id: 'no-promo', name: { cafe: 'No promo today', software: 'A normal day' }, story: { cafe: 'Just 1.2 app orders a minute all morning.', software: '60 writes a second and no burst.' }, change: { spike: null } },
      { id: 'bigger-promo', name: { cafe: 'The promo goes viral', software: 'A bigger burst' }, story: { cafe: '6 app orders a minute for 20 minutes.', software: '300 sign-ups a second for 20 seconds.' }, change: { spike: { t: 30, dur: 20, reads: 0, writes: 300 } } },
      { id: 'worst', name: { cafe: 'A long, viral promo', software: 'The biggest, longest burst' }, story: { cafe: 'The worst morning in the brief: 6 app orders a minute for 30 minutes.', software: 'The worst case in the constraints: 300 sign-ups a second for 30 seconds.' }, change: { spike: { t: 30, dur: 30, reads: 0, writes: 300 } } }
    ],
    scenes: {
      cafe: {
        title: 'The free-drink promo',
        brief: 'The shop takes orders on its app, and a barista takes each order. The espresso machine makes 2 drinks a minute, and normally 1.2 app orders come in each minute. At 8:00 a free-drink promo goes out, and for 20 minutes 5 orders arrive every minute. If orders go straight to the machine, the app refuses new ones when 4 are already waiting.',
        goal: 'Refuse fewer than 1% of orders and keep waits under 5 minutes, for $120 an hour or less.',
        constraints: ['Normal mornings: 1.2 app orders a minute.', 'A promo can bring up to 6 orders a minute, for up to 30 minutes.', 'The espresso machine makes 2 drinks a minute, and nothing faster fits the budget.', 'A ticket rail costs $10 an hour plus $10 an hour for every 2 drinks a minute its baristas pull.'],
        predict: { key: 'peakErrorRate', scale: 1, question: 'In the worst minute of the promo, what share of app orders get refused?', unit: '%' },
        hints: [
          'During the promo, 5 orders arrive each minute and the machine makes 2. Once 4 are waiting, where do the other 3 go?',
          'Nobody needs their drink the second they tap order. Taking the order now and making it a little later smooths a burst into a steady flow. In software this is a queue.',
          'Look between the order taker and the espresso machine. A ticket rail holds the orders, and baristas pull tickets no faster than the machine can make drinks.'
        ],
        scenario: {
          duration: 150, base: { reads: 0, writes: 60 }, spike: { t: 30, dur: 20, reads: 0, writes: 250 },
          latencyTargetMs: 5000, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.6 }
        }
      },
      software: {
        title: 'A sign-up burst',
        brief: 'Every sign-up is a write, and every request goes through an app server. The database handles 100 writes a second, and normal traffic is 60 a second. At 0:30 a launch post sends 250 sign-ups a second for 20 seconds. Writes sent straight to the database wait in its queue, which holds at most 200.',
        goal: 'Keep errors under 1% and slow requests under 5%, for $0.60 an hour or less.',
        constraints: ['Normal traffic: 60 writes a second.', 'A burst can reach 300 writes a second, for up to 30 seconds.', 'The database handles 100 writes a second, and a bigger one does not fit the budget.', 'A queue costs $0.05 an hour plus $0.05 per 100 writes a second its workers drain.'],
        predict: { key: 'peakErrorRate', scale: 1, question: 'At the worst second of the burst, what share of writes fail?', unit: '%' },
        hints: [
          'This is the promo again. How many writes a second arrive, and how many can the database take?',
          'Asynchronism: accept the write now and do the work later. A queue absorbs the burst, and workers drain it at a pace the database can take.',
          'Look between App server and Database: a queue whose workers together write 100 a second.'
        ],
        scenario: {
          duration: 150, base: { reads: 0, writes: 60 }, spike: { t: 30, dur: 20, reads: 0, writes: 250 },
          latencyTargetMs: 300, targets: { errorRate: 0.01, slowShare: 0.05, cost: 0.6 }
        }
      }
    }
  }
];

export { LEVELS, SCALE };
