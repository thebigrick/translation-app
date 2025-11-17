"use client";

import { Flex, FlexItem, Panel, Button, Box, H3, Text, Grid } from "@bigcommerce/big-design";
import { useTranslations } from 'next-intl';
import { useStoreInfo } from "@/components/store-info-provider";
import ErrorMessage from "@/components/error-message";
import { Header, Page } from "@bigcommerce/big-design-patterns";
import { TranslationsGetStarted } from "@/components/translations-get-started";
import { ResourceGroup } from "@/components/resource-group";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function HomeContent() {
  const t = useTranslations('app');
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = searchParams?.get("context");
  const {
    storeInformation,
    isLoading: isStoreInformationLoading,
    hasError: hasStoreInformationLoadingError,
  } = useStoreInfo();

  if (hasStoreInformationLoadingError) return <ErrorMessage />;

  const handleManageClick = () => {
    router.push(`/translations/manage${context ? `?context=${context}` : ""}`);
  };

  const handleJobsClick = () => {
    router.push(`/translations/jobs${context ? `?context=${context}` : ""}`);
  };

  return (
    <Page
      background={{
        src: "https://storage.googleapis.com/bigcommerce-production-dev-center/images/dev-portal-bg-pattern.svg",
        backgroundSize: "cover",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center top",
      }}
    >
      <Flex flexDirection="column" flexGap="1.5rem">
        <FlexItem>
          <Header
            title={t('home.welcome')}
            description={t('home.description')}
          />
        </FlexItem>
        <FlexItem>
          <Panel marginBottom="none">
            <TranslationsGetStarted
              isActive={storeInformation.multi_language_enabled}
              isLoading={isStoreInformationLoading}
            />
          </Panel>
        </FlexItem>
        {storeInformation.multi_language_enabled && !isStoreInformationLoading && (
          <FlexItem>
            <Panel header={t('home.quickActions.title')}>
              <Grid gridColumns="repeat(2, 1fr)" gridGap="medium">
                <Box
                  border="box"
                  padding="large"
                  borderRadius="normal"
                  style={{ cursor: "pointer" }}
                  onClick={handleManageClick}
                >
                  <Flex flexDirection="column" flexGap="0.5rem">
                    <H3 margin="none">{t('home.quickActions.manage.title')}</H3>
                    <Text color="secondary60">
                      {t('home.quickActions.manage.description')}
                    </Text>
                    <Box marginTop="small">
                      <Button variant="secondary" onClick={handleManageClick}>
                        {t('home.quickActions.manage.button')}
                      </Button>
                    </Box>
                  </Flex>
                </Box>
                <Box
                  border="box"
                  padding="large"
                  borderRadius="normal"
                  style={{ cursor: "pointer" }}
                  onClick={handleJobsClick}
                >
                  <Flex flexDirection="column" flexGap="0.5rem">
                    <H3 margin="none">{t('home.quickActions.jobs.title')}</H3>
                    <Text color="secondary60">
                      {t('home.quickActions.jobs.description')}
                    </Text>
                    <Box marginTop="small">
                      <Button variant="secondary" onClick={handleJobsClick}>
                        {t('home.quickActions.jobs.button')}
                      </Button>
                    </Box>
                  </Flex>
                </Box>
              </Grid>
            </Panel>
          </FlexItem>
        )}
        <FlexItem>
          <ResourceGroup fullWidth={false} />
        </FlexItem>
      </Flex>
    </Page>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <HomeContent />
    </Suspense>
  );
}
