import type { PresetFilter } from './smart-list-types';

/**
 * Six lifecycle preset filters — code constants, not DB records.
 * Users can "Save as Audience" to create a customized copy in the DB.
 */
const LIFECYCLE_WINDOWS = {
  serviceDueSoonDays: '30',
  leaseEndingDays: '90',
  warrantyExpiringDays: '90',
  recentPurchaseDays: '30',
} as const;

export const LIFECYCLE_PRESETS: PresetFilter[] = [
  {
    id: 'preset-service-overdue',
    name: 'Service Overdue',
    description: 'Contacts past their next service date',
    icon: 'WrenchIcon',
    color: 'red',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'nextServiceDate', operator: 'is_not_empty', value: '' },
            { id: 'c2', field: 'nextServiceDate', operator: 'overdue', value: '' },
          ],
        },
      ],
    },
  },
  {
    id: 'preset-service-due-soon',
    name: 'Service Due Soon',
    description: 'Next service date within 30 days',
    icon: 'ClockIcon',
    color: 'amber',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'nextServiceDate', operator: 'is_not_empty', value: '' },
            {
              id: 'c2',
              field: 'nextServiceDate',
              operator: 'within_days',
              value: LIFECYCLE_WINDOWS.serviceDueSoonDays,
            },
          ],
        },
      ],
    },
  },
  {
    id: 'preset-lease-ending',
    name: 'Lease Ending (90d)',
    description: 'Lease ending within 90 days',
    icon: 'KeyIcon',
    color: 'purple',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'leaseEndDate', operator: 'is_not_empty', value: '' },
            {
              id: 'c2',
              field: 'leaseEndDate',
              operator: 'within_days',
              value: LIFECYCLE_WINDOWS.leaseEndingDays,
            },
          ],
        },
      ],
    },
  },
  {
    id: 'preset-warranty-expiring',
    name: 'Warranty Expiring (90d)',
    description: 'Warranty ending within 90 days',
    icon: 'ShieldExclamationIcon',
    color: 'orange',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'warrantyEndDate', operator: 'is_not_empty', value: '' },
            {
              id: 'c2',
              field: 'warrantyEndDate',
              operator: 'within_days',
              value: LIFECYCLE_WINDOWS.warrantyExpiringDays,
            },
          ],
        },
      ],
    },
  },
  {
    id: 'preset-recent-purchases',
    name: 'Recent Purchases',
    description: 'Purchased within last 30 days',
    icon: 'SparklesIcon',
    color: 'emerald',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'purchaseDate', operator: 'is_not_empty', value: '' },
            {
              id: 'c2',
              field: 'purchaseDate',
              operator: 'within_days',
              value: LIFECYCLE_WINDOWS.recentPurchaseDays,
            },
          ],
        },
      ],
    },
  },
  {
    id: 'preset-no-vehicle',
    name: 'No Vehicle Data',
    description: 'Contacts missing vehicle information',
    icon: 'QuestionMarkCircleIcon',
    color: 'gray',
    definition: {
      version: 1,
      logic: 'AND',
      groups: [
        {
          id: 'g1',
          logic: 'AND',
          conditions: [
            { id: 'c1', field: 'vehicleYear', operator: 'is_empty', value: '' },
            { id: 'c2', field: 'vehicleMake', operator: 'is_empty', value: '' },
            { id: 'c3', field: 'vehicleModel', operator: 'is_empty', value: '' },
          ],
        },
      ],
    },
  },
];
