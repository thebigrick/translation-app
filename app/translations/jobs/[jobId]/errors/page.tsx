"use client";

import { useEffect, useState, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import styled from "styled-components";
import {
  Box,
  Button,
  Flex,
  FlexItem,
  Modal,
  Panel,
  Table,
  Text,
  ProgressCircle,
  OffsetPaginationProps,
} from "@bigcommerce/big-design";
import { theme as defaultTheme } from "@bigcommerce/big-design-theme";
import { Header, Page } from "@bigcommerce/big-design-patterns";
import { LoadingScreen } from "@/components/loading-indicator";
import { Suspense } from "react";
import { TranslationError as BaseTranslationError } from "@/lib/db/clients/types";

type ErrorRawData = {
  record: Record<string, any>;
  response: any[];
};

type TranslationErrorWithRawData = BaseTranslationError & {
  rawData: ErrorRawData;
  resourceType: string;
};

const StyledPanelContents = styled.div`
  display: block;
  box-sizing: border-box;
  margin-inline: -${defaultTheme.spacing.medium};
  max-width: calc(
    100% + ${defaultTheme.spacing.medium}px + ${defaultTheme.spacing.medium}px
  );
  overflow-x: auto;
  @media (min-width: ${defaultTheme.breakpointValues.tablet}) {
    margin-inline: -${defaultTheme.spacing.xLarge};
    max-width: calc(
      100% + ${defaultTheme.spacing.xLarge}px + ${defaultTheme.spacing.xLarge}px
    );
  }
`;

function TranslationsJobErrorsContent({ jobId }: { jobId: string }) {
  const t = useTranslations("translations.jobs");
  const searchParams = useSearchParams();
  const context = searchParams?.get("context");
  const router = useRouter();
  const [errors, setErrors] = useState<TranslationErrorWithRawData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedError, setSelectedError] = useState<TranslationErrorWithRawData | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const formatJsonString = (obj: any): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch (e) {
      return 'Invalid JSON';
    }
  };

  const fetchErrors = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/translations/jobs/${jobId}/errors?context=${context}`);
      if (!response.ok) throw new Error(t("errors.fetchErrors"));
      const data = await response.json();
      setErrors(data.errors);
    } catch (error) {
      console.error(t("errors.fetchErrors"), error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleBackClick = () => {
    router.push(context ? `/translations/jobs?context=${context}` : "/translations/jobs");
  };

  const handleViewDetails = (error: TranslationErrorWithRawData) => {
    setSelectedError(error);
    setShowDetailsModal(true);
  };

  useEffect(() => {
    if (context) {
      fetchErrors();
    }
  }, [context, jobId]);

  const columns = [
    {
      header: errors?.[0]?.resourceType == "categories" ? t("columnHeaders.categoryId") : errors?.[0]?.resourceType == "brands" ? t("columnHeaders.brandId") : errors?.[0]?.resourceType == "products" ? t("columnHeaders.productId") : t("columnHeaders.entityId"),
      hash: "entityId",
      render: (error: TranslationErrorWithRawData) => error.entityId == 0 ? "N/A" : error.entityId,
    },
    {
      header: t("columnHeaders.lineNumber"),
      hash: "lineNumber",
      render: (error: TranslationErrorWithRawData) => error.lineNumber || "N/A",
    },
    {
      header: t("columnHeaders.errorType"),
      hash: "errorType",
      render: (error: TranslationErrorWithRawData) => error.errorType,
    },
    {
      header: t("columnHeaders.errorMessage"),
      hash: "errorMessage",
      render: (error: TranslationErrorWithRawData) => (
        <Flex flexDirection="column" flexGap="small">
          <Text color="danger">{error.errorMessage}</Text>
        </Flex>
      ),
    },
    {
      hash: "actions",
      header: t("columnHeaders.actions"),
      render: (error: TranslationErrorWithRawData) => (
        <Button
          variant="secondary"
          onClick={() => handleViewDetails(error)}
        >
          {t("actions.viewDetails")}
        </Button>
      ),
    },
  ];

  const paginationProps: OffsetPaginationProps = {
    currentPage,
    totalItems: errors.length,
    itemsPerPage,
    onPageChange: setCurrentPage,
    itemsPerPageOptions: [10, 20, 50, 100],
    onItemsPerPageChange: (newItemsPerPage) => {
      setCurrentPage(1);
      setItemsPerPage(newItemsPerPage);
    },
  };

  const paginatedErrors = errors.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  return (
    <Page
      header={
        <Header
          title={t("errorsPage.title")}
          description={t("errorsPage.description")}
          backLink={{
            text: t("navigation.back"),
            onClick: handleBackClick,
            href: "#",
          }}
        />
      }
    >
      <Flex flexDirection="column" flexGap={defaultTheme.spacing.xLarge}>
        <FlexItem>
          <Panel header={t("errorsPage.tableTitle")}>
            <StyledPanelContents>
              <Table
                columns={columns}
                items={paginatedErrors}
                stickyHeader
                itemName={t("errorsPage.itemName")}
                pagination={paginationProps}
                emptyComponent={
                  isLoading ? (
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      paddingVertical="xxLarge"
                      paddingHorizontal="medium"
                    >
                      <ProgressCircle size="medium" />
                    </Flex>
                  ) : (
                    <Flex
                      alignItems="center"
                      justifyContent="center"
                      flexDirection="column"
                      paddingVertical="xxLarge"
                      paddingHorizontal="medium"
                    >
                      <Text marginBottom="small">{t("errorsPage.emptyState.title")}</Text>
                      <Text>{t("errorsPage.emptyState.description")}</Text>
                    </Flex>
                  )
                }
              />
            </StyledPanelContents>
          </Panel>
        </FlexItem>
      </Flex>

      {/* Error Details Modal */}
      <Modal
        isOpen={showDetailsModal}
        onClose={() => {
          setShowDetailsModal(false);
          setSelectedError(null);
        }}
        header={t("errorsPage.detailsModal.title")}
        closeOnClickOutside={true}
      >
        {selectedError && selectedError.rawData && (
          <Box padding="medium">
            <Flex flexDirection="column" flexGap="medium">
              <Box
                backgroundColor="secondary10"
                borderRadius="normal"
                padding="medium"
              >
                <Flex flexDirection="column" flexGap="small">
                  <Flex justifyContent="space-between" alignItems="center">
                    <Text bold>{selectedError.resourceType == "categories" ? t("columnHeaders.categoryId") : selectedError.resourceType == "brands" ? t("columnHeaders.brandId") : selectedError.resourceType == "products" ? t("columnHeaders.productId") : t("columnHeaders.entityId")}: {selectedError.entityId}</Text>
                    <Text color="secondary60">
                      {new Date(selectedError.createdAt).toLocaleString()}
                    </Text>
                  </Flex>
                  <Flex flexDirection="column">
                    <Text color="danger">{selectedError.errorMessage}</Text>
                    {selectedError.lineNumber > 0 && (
                      <Text>Line: {selectedError.lineNumber}</Text>
                    )}
                    <Text color="secondary70">
                      Type: {selectedError.errorType}
                    </Text>
                  </Flex>
                  <Box marginTop="medium">
                    <Text bold marginBottom="xSmall">Original Record:</Text>
                    <Box 
                      backgroundColor="white" 
                      padding="medium"
                      style={{ 
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        overflowX: 'auto'
                      }}
                    >
                      {formatJsonString((selectedError.rawData as ErrorRawData)?.record || {})}
                    </Box>
                    <Text bold marginTop="medium" marginBottom="xSmall">Error Response:</Text>
                    <Box 
                      backgroundColor="white" 
                      padding="medium"
                      style={{ 
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: '14px',
                        overflowX: 'auto'
                      }}
                    >
                      {formatJsonString((selectedError.rawData as ErrorRawData)?.response || [])}
                    </Box>
                  </Box>
                </Flex>
              </Box>
            </Flex>
          </Box>
        )}
      </Modal>
    </Page>
  );
}

export default function TranslationsJobErrors({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const resolvedParams = use(params);
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TranslationsJobErrorsContent jobId={resolvedParams.jobId} />
    </Suspense>
  );
} 