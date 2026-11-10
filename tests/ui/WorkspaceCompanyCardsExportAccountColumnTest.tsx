import {render, screen} from '@testing-library/react-native';

import ComposeProviders from '@components/ComposeProviders';
import {LocaleContextProvider} from '@components/LocaleContextProvider';
import OnyxListItemProvider from '@components/OnyxListItemProvider';
import type {CompareItemsCallback, TableColumn} from '@components/Table';
import WorkspaceCompanyCardsTable from '@components/Tables/WorkspaceCompanyCardsTable';
import type {WorkspaceCompanyCardTableItemData} from '@components/Tables/WorkspaceCompanyCardsTable/WorkspaceCompanyCardsTableRow';

import type {UseCompanyCardsResult} from '@hooks/useCompanyCards';

import CONST from '@src/CONST';
import ONYXKEYS from '@src/ONYXKEYS';
import type {Card} from '@src/types/onyx';
import type {CompanyCardFeedWithDomainID, CompanyCardFeedWithNumber} from '@src/types/onyx/CardFeeds';

import type {ListRenderItem, ListRenderItemInfo} from '@shopify/flash-list';
import type {PartialDeep} from 'type-fest';

import React from 'react';
import Onyx from 'react-native-onyx';

import createMock from '../utils/createMock';
import * as TestHelper from '../utils/TestHelper';
import waitForBatchedUpdates from '../utils/waitForBatchedUpdates';

TestHelper.setupApp();

const POLICY_ID = 'policy123';
const DOMAIN_OR_WORKSPACE_ACCOUNT_ID = 11111111;
const FEED_NAME = `${CONST.COMPANY_CARD.FEED_BANK_NAME.CHASE}#${DOMAIN_OR_WORKSPACE_ACCOUNT_ID}` as CompanyCardFeedWithDomainID;
const BANK_NAME = CONST.COMPANY_CARD.FEED_BANK_NAME.CHASE as CompanyCardFeedWithNumber;
const ACCOUNT_ID = 1;
const QBO_EXPORT_ACCOUNT_NVP = CONST.COMPANY_CARDS.EXPORT_CARD_TYPES.NVP_QUICKBOOKS_ONLINE_EXPORT_ACCOUNT;
const ROOT_ERROR_KEY = 'rootError';
const START_DATE_ERROR_KEY = 'startDateError';

let capturedColumns: Array<TableColumn<string, WorkspaceCompanyCardTableItemData>> = [];
let capturedData: WorkspaceCompanyCardTableItemData[] = [];
let capturedCompareItems: CompareItemsCallback<WorkspaceCompanyCardTableItemData, string> | undefined;
let capturedRenderItem: ListRenderItem<WorkspaceCompanyCardTableItemData> | undefined;
let mockShouldUseNarrowLayout = false;
let mockIsMediumScreenWidth = false;
let mockCardFeedErrors: Record<string, {shouldPromptBrokenConnection?: boolean}> = {};

jest.mock('@hooks/useLazyAsset', () => ({
    useMemoizedLazyIllustrations: () => ({}),
    useMemoizedLazyExpensifyIcons: () => ({}),
}));

jest.mock('@hooks/useCardFeedErrors', () => ({
    __esModule: true,
    default: () => ({cardFeedErrors: mockCardFeedErrors}),
}));

jest.mock('@hooks/useNetwork', () => ({
    __esModule: true,
    default: () => ({isOffline: false}),
}));

jest.mock('@hooks/useResponsiveLayout', () => ({
    __esModule: true,
    default: () => ({shouldUseNarrowLayout: mockShouldUseNarrowLayout, isMediumScreenWidth: mockIsMediumScreenWidth}),
}));

jest.mock('@components/ActivityIndicator', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {View} = require('react-native');
    return () => <View testID="WorkspaceCompanyCardsTableLoadingIndicator" />;
});

jest.mock('@pages/workspace/companyCards/WorkspaceCompanyCardPageEmptyState', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {View} = require('react-native');
    return () => <View testID="WorkspaceCompanyCardPageEmptyState" />;
});

type MockTableProps = {
    children?: React.ReactNode;
    columns: Array<TableColumn<string, WorkspaceCompanyCardTableItemData>>;
    data: WorkspaceCompanyCardTableItemData[];
    compareItems: CompareItemsCallback<WorkspaceCompanyCardTableItemData, string>;
    renderItem: ListRenderItem<WorkspaceCompanyCardTableItemData>;
};

// The real Table drives a FlashList and its own text measurement, neither of which this test needs: it only checks
// what WorkspaceCompanyCardsTable computes and hands to Table, so the mock captures those props instead of rendering
// the grid.
jest.mock('@components/Table', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {View} = require('react-native');

    // Kept outside MockTable, which the React Compiler treats as a component: capturing render props into a module
    // variable is only for this test's assertions and would otherwise look like an impure component body.
    function captureTableProps(columns: MockTableProps['columns'], data: MockTableProps['data'], compareItems: MockTableProps['compareItems'], renderItem: MockTableProps['renderItem']) {
        capturedColumns = columns;
        capturedData = data;
        capturedCompareItems = compareItems;
        capturedRenderItem = renderItem;
    }

    function MockTable({children, columns, data, compareItems, renderItem}: MockTableProps) {
        captureTableProps(columns, data, compareItems, renderItem);
        return <View testID="WorkspaceCompanyCardsTable">{children}</View>;
    }

    MockTable.Row = ({children, accessibilityLabel}: {children: (state: {hovered: boolean}) => React.ReactNode; accessibilityLabel: string}) => (
        <View accessibilityLabel={accessibilityLabel}>{children({hovered: false})}</View>
    );
    MockTable.FilterBar = () => <View testID="WorkspaceCompanyCardsTableFilterBar" />;
    MockTable.Header = () => <View testID="WorkspaceCompanyCardsTableHeader" />;
    MockTable.ListHeader = ({children}: {children?: React.ReactNode}) => children ?? null;
    MockTable.Body = () => <View testID="WorkspaceCompanyCardsTableBody" />;
    MockTable.EmptyState = () => <View testID="WorkspaceCompanyCardsTableEmptyState" />;
    MockTable.NoResultsState = () => <View testID="WorkspaceCompanyCardsTableNoResultsState" />;
    MockTable.LoadingState = () => <View testID="WorkspaceCompanyCardsTableLoadingIndicator" />;
    return {
        __esModule: true,
        default: MockTable,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
        composeTableListHeader: jest.requireActual('@components/Table/composeTableListHeader').default,
    };
});

jest.mock('@components/CardFeedIcon', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {View} = require('react-native');
    return () => <View testID="CardFeedIcon" />;
});

jest.mock('@components/Tables/WorkspaceCompanyCardsTable/WorkspaceCompanyCardsTableHeaderButtons', () => {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const {View} = require('react-native');
    return () => <View testID="WorkspaceCompanyCardsTableHeaderButtons" />;
});

function buildAssignedCard(overrides?: PartialDeep<Card, {recurseIntoArrays: true}>): Card {
    return createMock<Card>({
        cardID: 555,
        accountID: ACCOUNT_ID,
        bank: BANK_NAME,
        state: CONST.EXPENSIFY_CARD.STATE.OPEN,
        domainName: 'test.exfy',
        fraud: 'none',
        lastUpdated: '',
        nameValuePairs: {},
        ...overrides,
    });
}

function buildCompanyCards(assignedCard?: Card): UseCompanyCardsResult {
    return createMock<UseCompanyCardsResult>({
        feedName: FEED_NAME,
        bankName: BANK_NAME,
        assignedCards: assignedCard ? {[assignedCard.cardID]: assignedCard} : {},
        companyCardEntries: [
            {
                cardName: '4321',
                encryptedCardNumber: 'enc-4321',
                isAssigned: !!assignedCard,
                assignedCard,
            },
        ],
        workspaceCardFeedsStatus: {[DOMAIN_OR_WORKSPACE_ACCOUNT_ID]: {isLoading: false}},
        selectedFeed: {feed: BANK_NAME, status: {}},
        isInitiallyLoadingFeeds: false,
        isNoFeed: false,
        isFeedPending: false,
        isFeedAdded: true,
        onyxMetadata: {
            cardListMetadata: {status: 'loaded'},
            allCardFeedsMetadata: {status: 'loaded'},
            lastSelectedFeedMetadata: {status: 'loaded'},
        },
    });
}

function renderTable(companyCards: UseCompanyCardsResult) {
    return render(
        <ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider]}>
            <WorkspaceCompanyCardsTable
                policyID={POLICY_ID}
                isPolicyLoaded
                isPageFetchPending={false}
                domainOrWorkspaceAccountID={DOMAIN_OR_WORKSPACE_ACCOUNT_ID}
                companyCards={companyCards}
                onAssignCard={jest.fn()}
                isAssigningCardDisabled={false}
                canWriteCompanyCards
                isSelectionModeEnabled={false}
                onReloadPage={jest.fn()}
                onReloadFeed={jest.fn()}
            />
        </ComposeProviders>,
    );
}

async function setQBOPolicy(nvpExportAccount?: string) {
    await Onyx.merge(`${ONYXKEYS.COLLECTION.POLICY}${POLICY_ID}`, {
        id: POLICY_ID,
        connections: {
            quickbooksOnline: {
                config: {
                    nonReimbursableExpensesExportDestination: CONST.QUICKBOOKS_NON_REIMBURSABLE_EXPORT_ACCOUNT_TYPE.CREDIT_CARD,
                },
                data: {
                    creditCards: [{id: 'qbo-cc-1', name: 'Amex Corporate', currency: 'USD'}],
                },
            },
        },
    });
    await Onyx.merge(ONYXKEYS.PERSONAL_DETAILS_LIST, {
        [ACCOUNT_ID]: {accountID: ACCOUNT_ID, displayName: 'Alice Smith', login: 'alice@example.com'},
    });

    return buildAssignedCard({nameValuePairs: nvpExportAccount === undefined ? {} : {[QBO_EXPORT_ACCOUNT_NVP]: nvpExportAccount}});
}

describe('WorkspaceCompanyCardsTable Export account column', () => {
    beforeEach(async () => {
        mockCardFeedErrors = {};
        await Onyx.clear();
        await waitForBatchedUpdates();
    });

    it('shows the column and the resolved title when the connection is eligible', async () => {
        const card = await setQBOPolicy('qbo-cc-1');
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        expect(screen.getByTestId('WorkspaceCompanyCardsTable')).toBeTruthy();
        expect(capturedColumns.map((column) => column.key)).toContain('exportAccount');
        expect(capturedData.at(0)?.exportAccountTitle).toBe('Amex Corporate');
    });

    it('hides the column when the details page would hide the Accounting section too', async () => {
        await Onyx.merge(`${ONYXKEYS.COLLECTION.POLICY}${POLICY_ID}`, {
            id: POLICY_ID,
            connections: {
                quickbooksOnline: {
                    config: {nonReimbursableExpensesExportDestination: CONST.QUICKBOOKS_NON_REIMBURSABLE_EXPORT_ACCOUNT_TYPE.VENDOR_BILL},
                    data: {creditCards: []},
                },
            },
        });
        renderTable(buildCompanyCards(buildAssignedCard()));
        await waitForBatchedUpdates();

        expect(capturedColumns.map((column) => column.key)).not.toContain('exportAccount');
    });

    it('hides the column when no accounting connection exists', async () => {
        renderTable(buildCompanyCards(buildAssignedCard()));
        await waitForBatchedUpdates();

        expect(capturedColumns.map((column) => column.key)).not.toContain('exportAccount');
    });

    it('shows the default label when the card has no export NVP', async () => {
        const card = await setQBOPolicy(undefined);
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        expect(capturedData.at(0)?.exportAccountTitle).toBe(TestHelper.translateLocal('workspace.moreFeatures.companyCards.defaultCard'));
    });

    it('renders an empty export cell for an unassigned card without crashing', async () => {
        await setQBOPolicy('qbo-cc-1');
        renderTable(buildCompanyCards(undefined));
        await waitForBatchedUpdates();

        expect(capturedData.at(0)?.isAssigned).toBe(false);
        expect(capturedData.at(0)?.exportAccountTitle).toBeUndefined();
    });

    it('sorts by export account title, falling back to the card name on ties', async () => {
        await setQBOPolicy('qbo-cc-1');
        const cardA = buildAssignedCard({cardID: 1, nameValuePairs: {[QBO_EXPORT_ACCOUNT_NVP]: 'qbo-cc-1'}});
        const cardB = buildAssignedCard({cardID: 2, nameValuePairs: {[QBO_EXPORT_ACCOUNT_NVP]: CONST.COMPANY_CARDS.DEFAULT_EXPORT_TYPE}});
        renderTable(buildCompanyCards(cardA));
        await waitForBatchedUpdates();

        expect(capturedCompareItems).toBeDefined();

        const rowA = createMock<WorkspaceCompanyCardTableItemData>({
            keyForList: 'a',
            cardName: '1111',
            isAssigned: true,
            isCardDeleted: false,
            assignedCard: cardA,
            exportAccountTitle: 'Amex Corporate',
        });
        const rowB = createMock<WorkspaceCompanyCardTableItemData>({
            keyForList: 'b',
            cardName: '2222',
            isAssigned: true,
            isCardDeleted: false,
            assignedCard: cardB,
            exportAccountTitle: TestHelper.translateLocal('workspace.moreFeatures.companyCards.defaultCard'),
        });

        const ascending = capturedCompareItems?.(rowA, rowB, {columnKey: 'exportAccount', order: CONST.SEARCH.SORT_ORDER.ASC});
        expect(ascending).toBeLessThan(0);

        const descending = capturedCompareItems?.(rowA, rowB, {columnKey: 'exportAccount', order: CONST.SEARCH.SORT_ORDER.DESC});
        expect(descending).toBeGreaterThan(0);

        // Two rows sharing the default export account fall back to the card name for a stable order.
        const rowC = createMock<WorkspaceCompanyCardTableItemData>({...rowB, keyForList: 'c', cardName: '0000'});
        const tieBreak = capturedCompareItems?.(rowB, rowC, {columnKey: 'exportAccount', order: CONST.SEARCH.SORT_ORDER.ASC});
        expect(tieBreak).toBeGreaterThan(0);
    });

    it('keeps rendering when the export column disappears mid-session', async () => {
        const card = await setQBOPolicy('qbo-cc-1');
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        expect(capturedColumns.map((column) => column.key)).toContain('exportAccount');

        await Onyx.merge(`${ONYXKEYS.COLLECTION.POLICY}${POLICY_ID}`, {
            connections: {quickbooksOnline: {config: {nonReimbursableExpensesExportDestination: CONST.QUICKBOOKS_NON_REIMBURSABLE_EXPORT_ACCOUNT_TYPE.VENDOR_BILL}}},
        });
        await waitForBatchedUpdates();

        expect(capturedColumns.map((column) => column.key)).not.toContain('exportAccount');
        expect(screen.getByTestId('WorkspaceCompanyCardsTable')).toBeTruthy();
    });
});

describe('WorkspaceCompanyCardsTable row feedback', () => {
    beforeEach(async () => {
        mockCardFeedErrors = {};
        await Onyx.clear();
        await waitForBatchedUpdates();
    });

    it('combines root and transaction start date errors on the same row', async () => {
        // Given an assigned card whose unassignment and start-date updates both failed
        const card = buildAssignedCard({
            errors: {[ROOT_ERROR_KEY]: 'Unassignment failed'},
            errorFields: {scrapeMinDate: {[START_DATE_ERROR_KEY]: 'Start date update failed'}},
        });

        // When the company cards table builds its row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then both failures are forwarded together instead of competing for one slot
        expect(capturedData.at(0)?.errors).toEqual({[ROOT_ERROR_KEY]: 'Unassignment failed', [START_DATE_ERROR_KEY]: 'Start date update failed'});
    });

    it('forwards the transaction start date pending state to the row', async () => {
        // Given an assigned card with an offline transaction start date update
        const card = buildAssignedCard({pendingFields: {scrapeMinDate: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE}});

        // When the company cards table builds its row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then OfflineWithFeedback receives the field-level pending state
        expect(capturedData.at(0)?.pendingAction).toBe(CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE);
    });

    it('prioritizes card deletion over a pending transaction start date update', async () => {
        // Given a card that is being unassigned while its transaction start date update is still pending
        const card = buildAssignedCard({
            pendingAction: CONST.RED_BRICK_ROAD_PENDING_ACTION.DELETE,
            pendingFields: {scrapeMinDate: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE},
        });

        // When the company cards table builds its row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then the root deletion remains authoritative and the row is filtered from the online table
        expect(capturedData).toHaveLength(0);
    });

    it('shows a failed unassignment after its optimistic deletion is rolled back', async () => {
        // Given an unassignment failure while the transaction start date update is still pending
        const card = buildAssignedCard({
            pendingAction: null,
            pendingFields: {scrapeMinDate: CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE},
            errors: {[ROOT_ERROR_KEY]: 'Unassignment failed'},
        });

        // When the company cards table builds its row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then the row returns with its RBR while retaining the field-level pending feedback
        expect(capturedData).toHaveLength(1);
        expect(capturedData.at(0)?.errors).toEqual({[ROOT_ERROR_KEY]: 'Unassignment failed'});
        expect(capturedData.at(0)?.pendingAction).toBe(CONST.RED_BRICK_ROAD_PENDING_ACTION.UPDATE);
    });

    it('keeps a failed transaction start date update visible while the feed-level connection error is displayed', async () => {
        // Given a broken feed and a card with both root and start-date errors
        mockCardFeedErrors = {[FEED_NAME]: {shouldPromptBrokenConnection: true}};
        const card = buildAssignedCard({
            errors: {[ROOT_ERROR_KEY]: 'Unassignment failed'},
            errorFields: {scrapeMinDate: {[START_DATE_ERROR_KEY]: 'Start date update failed'}},
        });

        // When the company cards table builds its row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then the feed-level prompt owns the root error while the independent field failure remains actionable on the row
        expect(capturedData.at(0)?.errors).toEqual({[START_DATE_ERROR_KEY]: 'Start date update failed'});
    });
});

describe('WorkspaceCompanyCardsTable Last updated column', () => {
    beforeEach(async () => {
        jest.useFakeTimers().setSystemTime(new Date('2026-11-09T20:00:00Z'));
        mockCardFeedErrors = {};
        mockShouldUseNarrowLayout = false;
        mockIsMediumScreenWidth = false;
        await Onyx.clear();
        await Onyx.set(ONYXKEYS.SESSION, {accountID: ACCOUNT_ID});
        await Onyx.set(ONYXKEYS.PERSONAL_DETAILS_LIST, {
            [ACCOUNT_ID]: {accountID: ACCOUNT_ID, displayName: 'Alice', timezone: {automatic: false, selected: 'America/Los_Angeles'}},
        });
        await waitForBatchedUpdates();
    });

    afterEach(() => {
        mockShouldUseNarrowLayout = false;
        mockIsMediumScreenWidth = false;
        jest.useRealTimers();
    });

    it.each([
        {lastScrape: '2026-11-05 02:30:00', expected: 'Nov 4', tooltip: '2026-11-04 18:30:00'},
        {lastScrape: '2026-11-05T02:30:00Z', expected: 'Nov 4', tooltip: '2026-11-04 18:30:00'},
        {lastScrape: '2026-11-04T21:30:00-05:00', expected: 'Nov 4', tooltip: '2026-11-04 18:30:00'},
        {lastScrape: '2025-03-02T01:00:00Z', expected: 'Mar 1, 2025', tooltip: '2025-03-01 17:00:00'},
    ])('formats $lastScrape as a local Spend date with an exact tooltip', async ({lastScrape, expected, tooltip}) => {
        // Given a successful sync near a date boundary, in either supported timestamp format
        const card = buildAssignedCard({lastScrape});

        // When the table derives its columns and row data
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then the short date and full timestamp describe the same instant in the admin's timezone
        const column = capturedColumns.find(({key}) => key === 'lastUpdated');
        const row = capturedData.at(0);
        expect(column?.label).toBe('Last updated');
        expect(column?.sortable).toBe(true);
        expect(row?.lastUpdatedText).toBe(expected);
        expect(row?.lastUpdatedTooltip).toBe(tooltip);
        expect(row?.lastUpdatedTimestamp).toBe(Date.parse(lastScrape.replace(' ', 'T') + (lastScrape.includes('T') ? '' : 'Z')));
        expect(row && column?.dynamicSizing?.getContentToMeasure(row).at(0)?.text).toBe(expected);
    });

    it.each([undefined, '', 'invalid'])('handles an assigned card with timestamp %s', async (lastScrape) => {
        // Given an assigned card without a usable successful-sync time
        const card = buildAssignedCard({lastScrape});

        // When the table prepares its row
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then it shows Never without inventing a time or a tooltip
        expect(capturedData.at(0)?.lastUpdatedText).toBe('Never');
        expect(capturedData.at(0)?.lastUpdatedTooltip).toBeUndefined();
        expect(capturedData.at(0)?.lastUpdatedTimestamp).toBeUndefined();
    });

    it('leaves unassigned cells empty', async () => {
        // Given an unassigned feed entry with no card record
        const cards = buildCompanyCards();

        // When the table prepares its row
        renderTable(cards);
        await waitForBatchedUpdates();

        // Then it does not label unavailable history as Never or N/A
        expect(capturedData.at(0)?.lastUpdatedText).toBeUndefined();
        expect(capturedData.at(0)?.lastUpdatedTooltip).toBeUndefined();
        expect(capturedData.at(0)?.lastUpdatedTimestamp).toBeUndefined();
    });

    it.each([true, false])('keeps the successful instant when isLoadingLastUpdated is %s', async (isLoadingLastUpdated) => {
        // Given a prior success followed by a pending or failed manual update
        const card = buildAssignedCard({
            lastScrape: '2026-11-05 02:30:00',
            isLoadingLastUpdated,
            errorFields: isLoadingLastUpdated ? undefined : {lastScrape: {sync: 'Sync failed'}},
        });

        // When the table derives the display state
        renderTable(buildCompanyCards(card));
        await waitForBatchedUpdates();

        // Then pending text does not replace the successful time used for sorting or the tooltip
        expect(capturedData.at(0)?.lastUpdatedText).toBe(isLoadingLastUpdated ? 'Updating...' : 'Nov 4');
        expect(capturedData.at(0)?.lastUpdatedTooltip).toBe('2026-11-04 18:30:00');
        expect(capturedData.at(0)?.lastUpdatedTimestamp).toBe(Date.parse('2026-11-05T02:30:00Z'));
    });

    it('uses the selected local year and language for the abbreviated date', async () => {
        // Given UTC is in the new year while Los Angeles is still in the previous year
        jest.setSystemTime(new Date('2027-01-01T01:00:00Z'));
        await Onyx.set(ONYXKEYS.NVP_PREFERRED_LOCALE, CONST.LOCALES.FR);
        await waitForBatchedUpdates();

        // When a date from the current local year is rendered
        renderTable(buildCompanyCards(buildAssignedCard({lastScrape: '2026-11-05T02:30:00Z'})));
        await waitForBatchedUpdates();

        // Then the month is localized and no unnecessary year appears
        expect(capturedData.at(0)?.lastUpdatedText).toBe('nov. 4');
    });

    it('sorts stale assigned cards first ascending and keeps unassigned cards last in both directions', async () => {
        // Given tied timestamps, never-synced and updating cards, and two unassigned entries
        const cards = buildCompanyCards();
        cards.companyCardEntries = [
            {cardName: '6000', encryptedCardNumber: '6', isAssigned: false},
            {cardName: '3000', encryptedCardNumber: '3', isAssigned: true, assignedCard: buildAssignedCard({lastScrape: '2026-11-04 12:00:00'})},
            {cardName: '4000', encryptedCardNumber: '4', isAssigned: true, assignedCard: buildAssignedCard({lastScrape: '2026-11-05T12:00:00Z', isLoadingLastUpdated: true})},
            {cardName: '1000', encryptedCardNumber: '1', isAssigned: true, assignedCard: buildAssignedCard()},
            {cardName: '2000', encryptedCardNumber: '2', isAssigned: true, assignedCard: buildAssignedCard({lastScrape: '2026-11-04T12:00:00Z'})},
            {cardName: '5000', encryptedCardNumber: '5', isAssigned: false},
        ];

        // When sorting by sync time in each direction
        renderTable(cards);
        await waitForBatchedUpdates();
        const sortedNames = (columnKey: string, order: 'asc' | 'desc') =>
            [...capturedData].sort((a, b) => capturedCompareItems?.(a, b, {columnKey, order}) ?? 0).map(({cardName}) => cardName);

        // Then ties are deterministic, stale cards are easy to find, and other columns keep their grouping
        expect(sortedNames('lastUpdated', 'asc')).toEqual(['1000', '2000', '3000', '4000', '5000', '6000']);
        expect(sortedNames('lastUpdated', 'desc')).toEqual(['4000', '3000', '2000', '1000', '6000', '5000']);
        expect(sortedNames('card', 'asc')).toEqual(['5000', '6000', '1000', '2000', '3000', '4000']);
    });

    it.each([
        {layout: 'wide', narrow: false, medium: false, visible: true},
        {layout: 'narrow', narrow: true, medium: false, visible: false},
        {layout: 'medium', narrow: false, medium: true, visible: false},
    ])('renders the actual row in the $layout layout', async ({narrow, medium, visible}) => {
        // Given an assigned card in the requested layout
        mockShouldUseNarrowLayout = narrow;
        mockIsMediumScreenWidth = medium;
        renderTable(buildCompanyCards(buildAssignedCard({lastScrape: '2026-11-05 02:30:00'})));
        await waitForBatchedUpdates();

        // When the table's real row renderer runs
        const row = capturedRenderItem?.(createMock<ListRenderItemInfo<WorkspaceCompanyCardTableItemData>>({item: capturedData.at(0), index: 0}));
        render(<ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider]}>{row}</ComposeProviders>);
        await waitForBatchedUpdates();

        // Then only wide rows gain a cell, and the successful timestamp has an accessible label in every layout
        expect(!!screen.queryByText('Nov 4')).toBe(visible);
        expect(screen.getByLabelText(/Last successful sync: 2026-11-04 18:30:00/)).toBeTruthy();
    });
});

describe('WorkspaceCompanyCardsTable pending sync accessibility', () => {
    it('announces an update with no previous success without claiming that Updating is a timestamp', async () => {
        // Given a first sync is pending with no successful timestamp yet
        mockCardFeedErrors = {};
        await Onyx.clear();
        renderTable(buildCompanyCards(buildAssignedCard({isLoadingLastUpdated: true})));
        await waitForBatchedUpdates();

        // When the actual row is rendered
        const row = capturedRenderItem?.(createMock<ListRenderItemInfo<WorkspaceCompanyCardTableItemData>>({item: capturedData.at(0), index: 0}));
        render(<ComposeProviders components={[OnyxListItemProvider, LocaleContextProvider]}>{row}</ComposeProviders>);
        await waitForBatchedUpdates();

        // Then the label describes the pending state without inventing a successful sync
        expect(screen.getByLabelText(/Last updated: Updating/)).toBeTruthy();
        expect(screen.queryByLabelText(/Last successful sync/)).toBeNull();
        expect(capturedData.at(0)?.lastUpdatedTimestamp).toBeUndefined();
    });
});
