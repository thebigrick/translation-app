"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Box,
  Tabs,
  Panel,
  Text,
  Select,
  Flex,
  FlexItem,
  FormGroup,
} from "@bigcommerce/big-design";
import { Header, Page } from "@bigcommerce/big-design-patterns";
import { useChannels } from "@/hooks/useChannels";
import ErrorMessage from "@/components/error-message";
import { LoadingScreen } from "@/components/loading-indicator";
import { Suspense } from "react";
import CategoriesTable from "@/components/translations-manage/categories-table";
import SharedOptionsTable from "@/components/translations-manage/shared-options-table";
import SharedModifiersTable from "@/components/translations-manage/shared-modifiers-table";

function TranslationsManageContent() {
  const t = useTranslations("translations.manage");
  const searchParams = useSearchParams();
  const router = useRouter();
  const context = searchParams?.get("context");
  const [activeTab, setActiveTab] = useState("categories");
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null);
  const [selectedLocale, setSelectedLocale] = useState<string>("");

  const {
    channels,
    isLoading: isChannelsLoading,
    error: channelsError,
  } = useChannels(context ?? null);

  // Get available locales for selected channel, excluding the default locale
  const availableLocales = selectedChannel
    ? channels
        ?.find((c) => c.channel_id === selectedChannel)
        ?.locales.filter((locale) => !locale.is_default) || []
    : [];

  // Get default locale for selected channel
  const defaultLocale = selectedChannel
    ? channels
        ?.find((c) => c.channel_id === selectedChannel)
        ?.locales.find((locale) => locale.is_default)?.code || "en"
    : "en";

  const handleBackClick = () => {
    router.push(context ? `/?context=${context}` : "/");
  };

  const handleChannelChange = (selectedChannelId: string) => {
    const channelId = Number(selectedChannelId);
    const selectedChannel = channels?.find(
      (channel) => channel.channel_id === channelId
    );

    if (selectedChannel) {
      setSelectedChannel(channelId);
      // Get first non-default locale
      const nonDefaultLocales = selectedChannel.locales.filter(
        (locale) => !locale.is_default
      );
      const newLocale = nonDefaultLocales[0]?.code || "";
      setSelectedLocale(newLocale);

      // Save selections to localStorage
      localStorage.setItem(
        "translations_manage_selected_channel",
        channelId.toString()
      );
      localStorage.setItem("translations_manage_selected_locale", newLocale);
    }
  };

  const handleLocaleChange = (value: string) => {
    setSelectedLocale(value || "");
    localStorage.setItem("translations_manage_selected_locale", value);
  };

  // Load saved preferences or set defaults when channels load
  useEffect(() => {
    if (channels?.length && !selectedChannel) {
      const savedChannelId = localStorage.getItem(
        "translations_manage_selected_channel"
      );
      const savedLocale = localStorage.getItem("translations_manage_selected_locale");

      // Find the saved channel if it exists in current channels
      const savedChannel = savedChannelId
        ? channels.find((c) => c.channel_id === Number(savedChannelId))
        : null;

      if (
        savedChannel &&
        savedLocale &&
        savedChannel.locales.some(
          (l) => l.code === savedLocale && !l.is_default
        )
      ) {
        // Use saved preferences if valid and not default locale
        setSelectedChannel(savedChannel.channel_id);
        setSelectedLocale(savedLocale);
      } else {
        // Fall back to defaults
        const firstChannel = channels[0];
        const nonDefaultLocales = firstChannel.locales.filter(
          (locale) => !locale.is_default
        );
        const newLocale = nonDefaultLocales[0]?.code || "";

        setSelectedChannel(firstChannel.channel_id);
        setSelectedLocale(newLocale);

        // Save defaults
        localStorage.setItem(
          "translations_manage_selected_channel",
          firstChannel.channel_id.toString()
        );
        localStorage.setItem("translations_manage_selected_locale", newLocale);
      }
    }
  }, [channels, selectedChannel]);

  const tabs = [
    {
      id: "categories",
      title: t("tabs.categories"),
    },
    {
      id: "shared-options",
      title: t("tabs.sharedOptions"),
    },
    {
      id: "shared-modifiers",
      title: t("tabs.sharedModifiers"),
    },
  ];

  if (channelsError) return <ErrorMessage />;
  if (isChannelsLoading) return <LoadingScreen />;

  const channelOptions =
    channels?.map((c) => ({
      value: c.channel_id.toString(),
      content: c.channel_name,
    })) || [];

  const localeOptions = availableLocales.map((l) => ({
    value: l.code,
    content: l.title || l.code,
  }));

  return (
    <Page
      header={
        <Header
          title={t("pageTitle")}
          description={t("pageDescription")}
          backLink={{
            text: t("navigation.back"),
            onClick: handleBackClick,
            href: "#",
          }}
        />
      }
    >
      <Panel>
        <Box padding="medium">
          <Flex>
            <FlexItem flexGrow={1} marginRight="medium">
              <FormGroup>
                <Select
                  label={t("selectChannel")}
                  options={channelOptions}
                  onOptionChange={handleChannelChange}
                  value={selectedChannel?.toString() || ""}
                  required
                />
              </FormGroup>
            </FlexItem>

            <FlexItem flexGrow={1}>
              <FormGroup>
                <Select
                  label={t("selectLocale")}
                  options={localeOptions}
                  onOptionChange={handleLocaleChange}
                  value={selectedLocale}
                  disabled={!selectedChannel}
                  required
                />
              </FormGroup>
            </FlexItem>
          </Flex>
        </Box>

        <Tabs
          activeTab={activeTab}
          onTabClick={setActiveTab}
          items={tabs}
        />

        <Box padding="medium">
          {!selectedChannel || !selectedLocale ? (
            <Text>Please select a channel and locale to begin</Text>
          ) : (
            <>
              {activeTab === "categories" && (
                <CategoriesTable
                  context={context}
                  channelId={selectedChannel}
                  locale={selectedLocale}
                  defaultLocale={defaultLocale}
                />
              )}

              {activeTab === "shared-options" && (
                <SharedOptionsTable
                  context={context}
                  channelId={selectedChannel}
                  locale={selectedLocale}
                  defaultLocale={defaultLocale}
                />
              )}

              {activeTab === "shared-modifiers" && (
                <SharedModifiersTable
                  context={context}
                  channelId={selectedChannel}
                  locale={selectedLocale}
                  defaultLocale={defaultLocale}
                />
              )}
            </>
          )}
        </Box>
      </Panel>
    </Page>
  );
}

export default function TranslationsManage() {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TranslationsManageContent />
    </Suspense>
  );
}

