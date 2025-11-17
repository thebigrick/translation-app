import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import ActiveStateIcon from "@/icons/multi-lang-active-icon.svg";
import InactiveStateIcon from "@/icons/multi-lang-inactive-icon.svg";
import LoadingStateIcon from "@/icons/multi-lang-loading-icon.svg";
import { Suspense } from "react";
import { Button, Flex, FlexItem, Text, Box, H3 } from "@bigcommerce/big-design";
import { LoadingScreen } from "@/components/loading-indicator";

function TranslationsGetStartedContent({
  isActive = false,
  isLoading = true,
}: {
  isActive?: boolean;
  isLoading?: boolean;
}) {
  const t = useTranslations("app.getStarted");
  const quickActionsT = useTranslations("app.home.quickActions");
  const router = useRouter();
  const searchParams = useSearchParams();
  const context = searchParams?.get("context");
  const contextQuery = context ? `?context=${context}` : "";

  const mainText = isLoading
    ? t("checking")
    : isActive
    ? t("active")
    : t("inactive");

  const secondaryText = isLoading
    ? t("checkingDescription")
    : isActive
    ? t("activeDescription")
    : t("inactiveDescription");

  const buttonText = isActive ? t("startWorkflow") : t("contactSupport");

  const handleUploadClick = () => {
    router.push(`/translations/jobs${contextQuery}`);
  };

  const handleEditorClick = () => {
    router.push(`/translations/manage${contextQuery}`);
  };

  const handleClick = () => {
    if (isActive) {
      handleUploadClick();
      return;
    }

    window.open(
      "https://support.bigcommerce.com/s/article/Multi-Language-Setup",
      "_blank"
    );
  };

  return (
    <Flex
      justifyContent="center"
      alignItems="center"
      flexDirection="column"
      flexGap="20px"
    >
      <FlexItem>
        <Image
          src={
            isLoading
              ? LoadingStateIcon
              : isActive
              ? ActiveStateIcon
              : InactiveStateIcon
          }
          alt={mainText}
        />
      </FlexItem>
      <FlexItem>
        <Text color="secondary70" marginBottom="none" bold>
          {mainText}
        </Text>
      </FlexItem>
      <FlexItem>
        <Text color="secondary70" marginBottom="none">
          {secondaryText}
        </Text>
      </FlexItem>
      {isActive && !isLoading ? (
        <FlexItem style={{ width: "100%" }}>
          <Flex
            flexWrap="wrap"
            justifyContent="center"
            flexGap="1.5rem"
            style={{ width: "100%" }}
          >
            <Box
              border="box"
              padding="large"
              borderRadius="normal"
              style={{
                cursor: "pointer",
                minWidth: "260px",
                flex: "1 1 320px",
                maxWidth: "400px",
              }}
              onClick={handleUploadClick}
            >
              <Flex flexDirection="column" flexGap="0.5rem">
                <H3 margin="none">{quickActionsT("jobs.title")}</H3>
                <Text color="secondary60">
                  {quickActionsT("jobs.description")}
                </Text>
                <Box marginTop="small">
                  <Button
                    variant="primary"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleUploadClick();
                    }}
                  >
                    {quickActionsT("jobs.button")}
                  </Button>
                </Box>
              </Flex>
            </Box>
            <Box
              border="box"
              padding="large"
              borderRadius="normal"
              style={{
                cursor: "pointer",
                minWidth: "260px",
                flex: "1 1 320px",
                maxWidth: "400px",
              }}
              onClick={handleEditorClick}
            >
              <Flex flexDirection="column" flexGap="0.5rem">
                <H3 margin="none">{quickActionsT("manage.title")}</H3>
                <Text color="secondary60">
                  {quickActionsT("manage.description")}
                </Text>
                <Box marginTop="small">
                  <Button
                    variant="secondary"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleEditorClick();
                    }}
                  >
                    {quickActionsT("manage.button")}
                  </Button>
                </Box>
              </Flex>
            </Box>
          </Flex>
        </FlexItem>
      ) : (
        <FlexItem>
          <Button
            isLoading={isLoading}
            variant="secondary"
            onClick={handleClick}
          >
            {buttonText}
          </Button>
        </FlexItem>
      )}
    </Flex>
  );
}

export const TranslationsGetStarted = (props: {
  isActive?: boolean;
  isLoading?: boolean;
}) => {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TranslationsGetStartedContent {...props} />
    </Suspense>
  );
};
