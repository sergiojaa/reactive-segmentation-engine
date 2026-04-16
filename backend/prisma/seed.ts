import {
  Prisma,
  PrismaClient,
  SegmentStatus,
  SegmentType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';

type CustomerSeed = {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  city: string;
  attributesJson?: Prisma.InputJsonValue;
};

const prisma = new PrismaClient();

const daysAgo = (days: number): Date => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const customerGroups = {
  active: 10,
  vip: 6,
  risk: 8,
  none: 10,
} as const;

const staticSegmentKey = 'march_campaign_audience';
const activeSegmentKey = 'active_buyers_30d';
const vipSegmentKey = 'vip_customers_60d';
const riskSegmentKey = 'risk_group_90d_inactive';

function buildCustomers(): CustomerSeed[] {
  const customers: CustomerSeed[] = [];

  for (let i = 1; i <= customerGroups.active; i += 1) {
    customers.push({
      key: `active_${String(i).padStart(2, '0')}`,
      firstName: `Active${i}`,
      lastName: 'Buyer',
      email: `active${i}@demo.local`,
      country: 'GE',
      city: 'Tbilisi',
      attributesJson: {
        cohort: 'active',
        simulationCandidate: i <= 2,
      },
    });
  }

  for (let i = 1; i <= customerGroups.vip; i += 1) {
    customers.push({
      key: `vip_${String(i).padStart(2, '0')}`,
      firstName: `Vip${i}`,
      lastName: 'Customer',
      email: `vip${i}@demo.local`,
      country: 'GE',
      city: 'Batumi',
      attributesJson: {
        cohort: 'vip',
        accountTier: 'gold',
      },
    });
  }

  for (let i = 1; i <= customerGroups.risk; i += 1) {
    customers.push({
      key: `risk_${String(i).padStart(2, '0')}`,
      firstName: `Risk${i}`,
      lastName: 'Dormant',
      email: `risk${i}@demo.local`,
      country: 'GE',
      city: 'Kutaisi',
      attributesJson: {
        cohort: 'risk',
        simulationCandidate: i <= 3,
      },
    });
  }

  for (let i = 1; i <= customerGroups.none; i += 1) {
    customers.push({
      key: `none_${String(i).padStart(2, '0')}`,
      firstName: `None${i}`,
      lastName: 'Prospect',
      email: `none${i}@demo.local`,
      country: 'GE',
      city: 'Rustavi',
      attributesJson: {
        cohort: 'none',
        simulationCandidate: i === 1 || i === 2,
      },
    });
  }

  return customers;
}

async function main(): Promise<void> {
  await prisma.segmentMembershipDelta.deleteMany();
  await prisma.segmentMembership.deleteMany();
  await prisma.dataChangeEvent.deleteMany();
  await prisma.segmentEvaluationRun.deleteMany();
  await prisma.segmentDependency.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.customerAttributeSnapshot.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.simulationClock.deleteMany();
  await prisma.customer.deleteMany();

  const customers = buildCustomers();
  const customerIdByKey = new Map<string, string>();

  for (const customer of customers) {
    const customerId = randomUUID();
    customerIdByKey.set(customer.key, customerId);

    await prisma.customer.create({
      data: {
        id: customerId,
        externalId: `ext_${customer.key}`,
        email: customer.email,
        firstName: customer.firstName,
        lastName: customer.lastName,
        country: customer.country,
        city: customer.city,
        attributesJson: customer.attributesJson,
      },
    });
  }

  const transactions: Prisma.TransactionCreateManyInput[] = [];
  const pushTransaction = (
    customerKey: string,
    amount: number,
    daysBeforeNow: number,
    type: string,
  ): void => {
    transactions.push({
      id: randomUUID(),
      customerId: customerIdByKey.get(customerKey)!,
      externalId: `txn_${customerKey}_${transactions.length + 1}`,
      type,
      amount: new Prisma.Decimal(amount),
      currency: 'USD',
      occurredAt: daysAgo(daysBeforeNow),
      payloadJson: {
        channel: 'web',
        note: `${type} ${amount} USD`,
      },
    });
  };

  for (let i = 1; i <= customerGroups.active; i += 1) {
    const key = `active_${String(i).padStart(2, '0')}`;
    pushTransaction(key, 250 + i * 20, 5 + i, 'purchase');
    pushTransaction(key, 120 + i * 10, 12 + i, 'purchase');
  }

  for (let i = 1; i <= customerGroups.vip; i += 1) {
    const key = `vip_${String(i).padStart(2, '0')}`;
    pushTransaction(key, 2100 + i * 100, 8 + i, 'purchase');
    pushTransaction(key, 1800 + i * 80, 14 + i, 'purchase');
    pushTransaction(key, 1700 + i * 70, 21 + i, 'purchase');
    pushTransaction(key, 1500 + i * 60, 32 + i, 'purchase');
  }

  for (let i = 1; i <= customerGroups.risk; i += 1) {
    const key = `risk_${String(i).padStart(2, '0')}`;
    pushTransaction(key, 500 + i * 50, 120 + i, 'purchase');
    pushTransaction(key, 300 + i * 30, 160 + i, 'purchase');
  }

  await prisma.transaction.createMany({ data: transactions });

  const segmentIds = {
    active: randomUUID(),
    vip: randomUUID(),
    risk: randomUUID(),
    marchCampaign: randomUUID(),
  };

  await prisma.segment.createMany({
    data: [
      {
        id: segmentIds.active,
        key: activeSegmentKey,
        name: 'Active buyers',
        description: 'At least one purchase transaction in the last 30 days.',
        type: SegmentType.DYNAMIC,
        status: SegmentStatus.ACTIVE,
        definitionJson: {
          ruleType: 'ACTIVE_BUYERS',
          lookbackDays: 30,
          minTransactions: 1,
        },
      },
      {
        id: segmentIds.vip,
        key: vipSegmentKey,
        name: 'VIP customers',
        description:
          'Total purchase amount in last 60 days is greater than 5000, filtered by Active buyers.',
        type: SegmentType.DYNAMIC,
        status: SegmentStatus.ACTIVE,
        definitionJson: {
          ruleType: 'VIP_CUSTOMERS',
          lookbackDays: 60,
          minTotalAmount: 5000,
        },
      },
      {
        id: segmentIds.risk,
        key: riskSegmentKey,
        name: 'Risk group',
        description:
          'No purchases in last 90 days, but customer had purchases before that.',
        type: SegmentType.DYNAMIC,
        status: SegmentStatus.ACTIVE,
        definitionJson: {
          inactivityDays: 90,
          ruleType: 'RISK_GROUP',
        },
      },
      {
        id: segmentIds.marchCampaign,
        key: staticSegmentKey,
        name: 'March campaign audience',
        description: 'Static campaign list for March outreach demo.',
        type: SegmentType.STATIC,
        status: SegmentStatus.ACTIVE,
        definitionJson: {
          kind: 'static',
          source: 'marketing_csv_import',
          campaign: 'march_2026',
          customerIds: [
            'active_01',
            'active_02',
            'vip_01',
            'vip_02',
            'risk_01',
            'risk_02',
            'none_01',
            'none_02',
          ].map((customerKey) => customerIdByKey.get(customerKey)!),
        },
      },
    ],
  });

  await prisma.segmentDependency.create({
    data: {
      id: randomUUID(),
      segmentId: segmentIds.vip,
      dependsOnSegmentId: segmentIds.active,
    },
  });

  const staticMembers = [
    'active_01',
    'active_02',
    'vip_01',
    'vip_02',
    'risk_01',
    'risk_02',
    'none_01',
    'none_02',
  ];

  await prisma.segmentMembership.createMany({
    data: staticMembers.map((customerKey, index) => ({
      id: randomUUID(),
      segmentId: segmentIds.marchCampaign,
      customerId: customerIdByKey.get(customerKey)!,
      isManual: true,
      addedAt: daysAgo(20 - index),
      lastEvaluatedAt: daysAgo(20 - index),
    })),
  });

  await prisma.simulationClock.create({
    data: {
      key: 'global',
      currentTime: new Date('2026-03-20T10:00:00.000Z'),
      isFrozen: true,
      tickSeconds: 3600,
      lastAdvancedAt: new Date('2026-03-20T10:00:00.000Z'),
      metadataJson: {
        scenario: 'march-campaign-replay',
        note: 'Frozen time for deterministic simulation runs.',
      },
    },
  });

  console.log(
    `Seed completed: ${customers.length} customers, ${transactions.length} transactions, 4 segments.`,
  );
}

void main()
  .catch(async (error) => {
    console.error('Seed failed', error);
    process.exitCode = 1;
    await prisma.$disconnect();
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
