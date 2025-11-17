import { NextRequest, NextResponse } from "next/server";
import { createGraphQLClient } from "@bigcommerce/translations-graphql-client";
import { getSessionFromContext } from "@/lib/auth";
import { extractNumericId } from "@/lib/utils/shared-option-helpers";

const SHARED_OPTIONS_PAGE_SIZE = 50;

async function fetchAllSharedOptions(
  graphqlClient: any,
  channelId: number,
  locale: string
) {
  const allEdges: any[] = [];
  let cursor: string | undefined;

  while (true) {
    const result = await graphqlClient.getSharedProductOptions({
      channelId,
      locale,
      first: SHARED_OPTIONS_PAGE_SIZE,
      after: cursor,
    });

    const edges = result.edges || [];
    allEdges.push(...edges);

    const pageInfo = result.pageInfo;
    if (pageInfo?.hasNextPage && pageInfo.endCursor) {
      cursor = pageInfo.endCursor;
    } else {
      break;
    }
  }

  return allEdges;
}

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

    console.log('[Shared Options GET] Fetching with:', { channelId, locale });

    const edges = await fetchAllSharedOptions(
      graphqlClient,
      Number(channelId),
      locale
    );

    console.log('[Shared Options GET] Total edges fetched:', edges.length);

    const options = edges.map((edge: any) => ({
      id: edge.node.id,
      displayName: edge.node.displayName,
      translation: edge.node.overridesForLocale?.displayName || "",
      __typename: edge.node.__typename,
      values: (edge.node.values || []).map((value: any) => {
        const numericValueId = extractNumericId(value.id);
        const overrideValue = edge.node.overridesForLocale?.values?.find(
          (v: any) => extractNumericId(v.id) === numericValueId
        );
        return {
          id: value.id,
          label: value.label,
          translation: overrideValue?.label || "",
        };
      }),
    }));

    console.log('[Shared Options GET] Returning options:', options.length);
    if (options.length > 0) {
      console.log(
        '[Shared Options GET] Sample option:',
        JSON.stringify(options[0], null, 2)
      );
    }
    return NextResponse.json(options);
  } catch (error: any) {
    console.error("[Shared Options GET] Error fetching shared options:", error);
    console.error("[Shared Options GET] Error details:", {
      message: error.message,
      stack: error.stack,
      response: error.response?.data
    });
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

    console.log('[Shared Options PUT] Incoming request:', {
      optionId,
      valueId,
      channelId,
      locale,
      type,
      translation,
    });

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

    console.log(
      '[Shared Options PUT] Option fetch result:',
      JSON.stringify(optionResult?.edges?.[0]?.node, null, 2)
    );

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

    console.log('[Shared Options PUT] Prepared mutation data:', {
      optionType,
      fieldName,
      data,
    });

    const mutationInput = {
      channelId: Number(channelId),
      locale,
      options: [
        {
          optionId,
          type: optionType,
          data,
        },
      ],
    };

    console.log(
      '[Shared Options PUT] Mutation input:',
      JSON.stringify(mutationInput, null, 2)
    );

    const mutationResult =
      await graphqlClient.setSharedProductOptionsInformation(mutationInput);

    console.log(
      '[Shared Options PUT] Mutation result:',
      JSON.stringify(mutationResult, null, 2)
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Error updating shared option translation:", error);
    return NextResponse.json(
      { error: error.message || "Failed to update translation" },
      { status: 500 }
    );
  }
}

