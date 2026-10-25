// Compile-time guarantee that the SDK's public wire types (./types.ts) stay
// identical to the domain records in @community-os/core. This file produces no
// runtime code — if a core record shape changes, `tsc --noEmit` fails here.

import type * as Core from "@community-os/core";
import type * as Public from "./types.js";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;

type _Workspace = Assert<Equal<Core.Workspace, Public.Workspace>>;
type _Source = Assert<Equal<Core.Source, Public.Source>>;
type _Message = Assert<Equal<Core.Message, Public.Message>>;
type _FileRecord = Assert<Equal<Core.FileRecord, Public.FileRecord>>;
type _Member = Assert<Equal<Core.Member, Public.Member>>;
type _Citation = Assert<Equal<Core.Citation, Public.Citation>>;
type _Resource = Assert<Equal<Core.Resource, Public.Resource>>;
type _Demand = Assert<Equal<Core.Demand, Public.Demand>>;
type _Venue = Assert<Equal<Core.Venue, Public.Venue>>;
type _Sponsor = Assert<Equal<Core.Sponsor, Public.Sponsor>>;
type _Proposal = Assert<Equal<Core.Proposal, Public.Proposal>>;
type _EventRecord = Assert<Equal<Core.EventRecord, Public.EventRecord>>;
type _Guest = Assert<Equal<Core.Guest, Public.Guest>>;
type _TimelineEvent = Assert<Equal<Core.TimelineEvent, Public.TimelineEvent>>;
type _Application = Assert<Equal<Core.Application, Public.Application>>;
type _BlocklistEntry = Assert<Equal<Core.BlocklistEntry, Public.BlocklistEntry>>;
type _AutopilotArtifact = Assert<Equal<Core.AutopilotArtifact, Public.AutopilotArtifact>>;
type _WebhookSubscription = Assert<Equal<Core.WebhookSubscription, Public.WebhookSubscription>>;
type _SourceKind = Assert<Equal<Core.SourceKind, Public.SourceKind>>;
type _ProposalStatus = Assert<Equal<Core.ProposalStatus, Public.ProposalStatus>>;
type _ApplicationDecision = Assert<Equal<Core.ApplicationDecision, Public.ApplicationDecision>>;
type _LeadRole = Assert<Equal<Core.LeadRole, Public.LeadRole>>;
type _Store = Assert<Equal<Core.Store, Public.Store>>;
type _NormalizedMessage = Assert<Equal<Core.NormalizedMessage, Public.NormalizedMessage>>;
