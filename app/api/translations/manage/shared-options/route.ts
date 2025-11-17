import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";

// GET - Fetch shared options with translations
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const channelId = searchParams.get("channelId");
    const locale = searchParams.get("locale");

    if (!channelId || !locale) {
      return NextResponse.json(
        { error: "channelId and locale are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    const { accessToken, storeHash } = await getSessionFromContext(context);

    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    const result = await graphqlClient.getSharedProductOptions({
      channelId: Number(channelId),
      locale,
      first: 250,
    });

    const options = (result.edges || []).map((edge: any) => ({
      id: edge.node.id,
      displayName: edge.node.displayName,
      translation: edge.node.overridesForLocale?.displayName || "",
      __typename: edge.node.__typename,
      values: (edge.node.values || []).map((value: any) => {
        const overrideValue = edge.node.overridesForLocale?.values?.find(
          (v: any) => v.id === value.id
        );
        return {
          id: value.id,
          label: value.label,
          translation: overrideValue?.label || "",
        };
      }),
    }));

    return NextResponse.json(options);
  } catch (error: any) {
    console.error("Error fetching shared options:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch shared options" },
      { status: 500 }
    );
  }
}

// PUT - Update shared option translation
export async function PUT(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const context = searchParams.get("context");
    const body = await request.json();

    const { optionId, valueId, channelId, locale, translation, type } = body;

    if (!optionId || !channelId || !locale || !type) {
      return NextResponse.json(
        { error: "optionId, channelId, locale, and type are required" },
        { status: 400 }
      );
    }

    if (!context) {
      return NextResponse.json(
        { error: "Context is required" },
        { status: 400 }
      );
    }

    const { accessToken, storeHash } = await getSessionFromContext(context);

    const graphqlClient = createGraphQLClient(accessToken, storeHash);

    // Fetch option to get its type
    const optionResult = await graphqlClient.getSharedProductOptions({
      channelId: Number(channelId),
      locale,
      first: 1,
      ids: [optionId],
    });

    if (!optionResult.edges || optionResult.edges.length === 0) {
      return NextResponse.json({ error: "Option not found" }, { status: 404 });
    }

    const optionNode = optionResult.edges[0]?.node;
    if (!optionNode) {
      return NextResponse.json({ error: "Option not found" }, { status: 404 });
    }

    const optionType = optionNode.__typename;
    const fieldName = optionType
      .replace("SharedProductOption", "")
      .charAt(0).toLowerCase() + 
      optionType.replace("SharedProductOption", "").slice(1);

    let data: any = {};

    if (type === "displayName") {
      data[fieldName] = {
        displayName: translation || undefined,
      };
    } else if (type === "value" && valueId) {
      data[fieldName] = {
        values: [
          {
            valueId,
            label: translation,
          },
        ],
      };
    }

    await graphqlClient.setSharedProductOptionsInformation({
      channelId: Number(channelId),
      locale,
      options: [
        {
          optionId,
          type: optionType,
          data,
        },
      ],
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating shared option translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}

