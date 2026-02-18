// ── Audience Filter Type Definitions ──

// Field types determine which operators are available
export type FieldType = 'text' | 'date' | 'tags' | 'boolean';

// Operators by field type
export type TextOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'not_equals'
  | 'is_empty'
  | 'is_not_empty';

export type DateOperator =
  | 'before'
  | 'after'
  | 'between'
  | 'within_days'
  | 'overdue'
  | 'is_empty'
  | 'is_not_empty';

export type TagsOperator =
  | 'includes_any'
  | 'includes_all'
  | 'excludes'
  | 'is_empty'
  | 'is_not_empty';

export type BooleanOperator = 'is_true' | 'is_false';

export type FilterOperator = TextOperator | DateOperator | TagsOperator | BooleanOperator;

// Operator labels for the UI
export const OPERATOR_LABELS: Record<FilterOperator, string> = {
  contains: 'contains',
  not_contains: 'does not contain',
  equals: 'equals',
  not_equals: 'does not equal',
  is_empty: 'is empty',
  is_not_empty: 'is not empty',
  before: 'is before',
  after: 'is after',
  between: 'is between',
  within_days: 'is within (days)',
  overdue: 'is overdue',
  includes_any: 'includes any of',
  includes_all: 'includes all of',
  excludes: 'excludes',
  is_true: 'is true',
  is_false: 'is false',
};

// Operators available per field type
export const OPERATORS_BY_TYPE: Record<FieldType, FilterOperator[]> = {
  text: ['contains', 'not_contains', 'equals', 'not_equals', 'is_empty', 'is_not_empty'],
  date: ['before', 'after', 'between', 'within_days', 'overdue', 'is_empty', 'is_not_empty'],
  tags: ['includes_any', 'includes_all', 'excludes', 'is_empty', 'is_not_empty'],
  boolean: ['is_true', 'is_false'],
};

// Operators that need no value input
export const NO_VALUE_OPERATORS: FilterOperator[] = ['is_empty', 'is_not_empty', 'overdue', 'is_true', 'is_false'];

// ── Filter Definition (stored as JSON in DB) ──

export interface FilterCondition {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  value2?: string; // for 'between' date operator
}

export interface FilterGroup {
  id: string;
  logic: 'AND' | 'OR';
  conditions: FilterCondition[];
}

export interface FilterDefinition {
  version: 1;
  logic: 'AND' | 'OR';
  groups: FilterGroup[];
}

// ── Preset Filter (code constant, not DB record) ──

export interface PresetFilter {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  definition: FilterDefinition;
}

// ── Field Definitions (for the filter builder UI) ──

export type FieldCategory = 'contact' | 'vehicle' | 'lifecycle' | 'messaging' | 'meta';

export interface FieldDefinition {
  key: string;
  label: string;
  type: FieldType;
  category: FieldCategory;
}

export const FILTERABLE_FIELDS: FieldDefinition[] = [
  // Contact info
  { key: 'firstName', label: 'First Name', type: 'text', category: 'contact' },
  { key: 'lastName', label: 'Last Name', type: 'text', category: 'contact' },
  { key: 'fullName', label: 'Full Name', type: 'text', category: 'contact' },
  { key: 'email', label: 'Email', type: 'text', category: 'contact' },
  { key: 'phone', label: 'Phone', type: 'text', category: 'contact' },
  { key: 'city', label: 'City', type: 'text', category: 'contact' },
  { key: 'state', label: 'State', type: 'text', category: 'contact' },
  { key: 'postalCode', label: 'Postal Code', type: 'text', category: 'contact' },
  { key: 'source', label: 'Source', type: 'text', category: 'contact' },

  // Vehicle
  { key: 'vehicleYear', label: 'Vehicle Year', type: 'text', category: 'vehicle' },
  { key: 'vehicleMake', label: 'Vehicle Make', type: 'text', category: 'vehicle' },
  { key: 'vehicleModel', label: 'Vehicle Model', type: 'text', category: 'vehicle' },
  { key: 'vehicleVin', label: 'VIN', type: 'text', category: 'vehicle' },
  { key: 'vehicleMileage', label: 'Mileage', type: 'text', category: 'vehicle' },

  // Lifecycle dates
  { key: 'dateAdded', label: 'Date Added', type: 'date', category: 'lifecycle' },
  { key: 'purchaseDate', label: 'Purchase Date', type: 'date', category: 'lifecycle' },
  { key: 'lastServiceDate', label: 'Last Service Date', type: 'date', category: 'lifecycle' },
  { key: 'nextServiceDate', label: 'Next Service Date', type: 'date', category: 'lifecycle' },
  { key: 'leaseEndDate', label: 'Lease End Date', type: 'date', category: 'lifecycle' },
  { key: 'warrantyEndDate', label: 'Warranty End Date', type: 'date', category: 'lifecycle' },

  // Messaging
  { key: 'hasReceivedMessage', label: 'Has Received Any Message', type: 'boolean', category: 'messaging' },
  { key: 'hasReceivedEmail', label: 'Has Received Email', type: 'boolean', category: 'messaging' },
  { key: 'hasReceivedSms', label: 'Has Received SMS', type: 'boolean', category: 'messaging' },
  { key: 'lastMessageDate', label: 'Last Message Date', type: 'date', category: 'messaging' },

  // Meta
  { key: 'tags', label: 'Tags', type: 'tags', category: 'meta' },
];

// Group fields by category for the filter builder dropdown
export const FIELD_CATEGORIES: { key: FieldCategory; label: string }[] = [
  { key: 'contact', label: 'Contact Info' },
  { key: 'vehicle', label: 'Vehicle' },
  { key: 'lifecycle', label: 'Lifecycle Dates' },
  { key: 'messaging', label: 'Messaging' },
  { key: 'meta', label: 'Meta' },
];
