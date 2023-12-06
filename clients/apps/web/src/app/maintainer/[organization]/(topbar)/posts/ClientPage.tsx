'use client'

import { AnimatedIconButton } from '@/components/Feed/Posts/Post'
import { DashboardBody } from '@/components/Layout/DashboardLayout'
import { StaggerReveal } from '@/components/Shared/StaggerReveal'
import { SubscriptionsChart } from '@/components/Subscriptions/SubscriptionsChart'
import { useCurrentOrgAndRepoFromURL } from '@/hooks'
import { EnvelopeIcon, EyeIcon, PhotoIcon } from '@heroicons/react/24/outline'
import {
  AddOutlined,
  ArrowForward,
  LanguageOutlined,
  ViewDayOutlined,
} from '@mui/icons-material'
import { Article } from '@polar-sh/sdk'
import Link from 'next/link'
import { Button, Card, PolarTimeAgo } from 'polarkit/components/ui/atoms'
import {
  useOrganizationArticles,
  useSubscriptionStatistics,
  useSubscriptionSummary,
} from 'polarkit/hooks'
import { useMemo, useRef } from 'react'
import { useHoverDirty } from 'react-use'

const startOfMonth = new Date()
startOfMonth.setUTCHours(0, 0, 0, 0)
startOfMonth.setUTCDate(1)

const startOfMonthSixMonthsAgo = new Date()
startOfMonthSixMonthsAgo.setUTCHours(0, 0, 0, 0)
startOfMonthSixMonthsAgo.setUTCDate(1)
startOfMonthSixMonthsAgo.setUTCMonth(startOfMonth.getMonth() - 2)

const ClientPage = () => {
  const { org } = useCurrentOrgAndRepoFromURL()

  const posts = useOrganizationArticles({
    orgName: org?.name,
    platform: org?.platform,
    showUnpublished: true,
  })

  const summary = useSubscriptionSummary(org?.name ?? '')
  const subscriptionStatistics = useSubscriptionStatistics(
    org?.name ?? '',
    startOfMonthSixMonthsAgo,
    startOfMonth,
  )

  return (
    <>
      <DashboardBody>
        <div className="items mb-24 flex w-full flex-col-reverse items-start gap-y-12  xl:flex-row xl:gap-x-12 xl:gap-y-0">
          <div className="flex w-full flex-col gap-y-8 overflow-hidden">
            <div className="flex flex-row items-center justify-between">
              <h3 className="dark:text-polar-50 text-lg font-medium text-gray-950">
                Overview
              </h3>
              <Link href={`/maintainer/${org?.name}/posts/new`}>
                <Button className="h-8 w-8 rounded-full">
                  <AddOutlined fontSize="inherit" />
                </Button>
              </Link>
            </div>
            <div className="flex flex-col gap-y-12">
              {(posts.data?.items?.length ?? 0) > 0 ? (
                <StaggerReveal className="flex w-full flex-col gap-y-6">
                  {posts?.data?.items
                    ? posts.data.items.map((post) => (
                        <StaggerReveal.Child key={post.id}>
                          <PostItem {...post} />
                        </StaggerReveal.Child>
                      ))
                    : null}
                </StaggerReveal>
              ) : (
                <div className="dark:text-polar-500 flex h-full flex-col items-center gap-y-4 pt-32 text-gray-500">
                  <ViewDayOutlined fontSize="large" />
                  <div className="flex flex-col items-center gap-y-2">
                    <h3 className="p-2 text-lg font-medium">No Posts yet</h3>
                    <p className="dark:text-polar-600 min-w-0 truncate text-gray-300">
                      Create your first post to start engaging with your
                      subscribers
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-shrink-0 flex-col gap-y-8 xl:w-1/3">
            <div className="flex w-full flex-grow flex-row items-center justify-between">
              <h3 className="dark:text-polar-50 text-lg font-medium text-gray-950">
                Analytics
              </h3>
            </div>
            {subscriptionStatistics.data && (
              <Card className="flex flex-col gap-y-4 rounded-3xl p-4">
                <div className="flex w-full flex-grow flex-row items-center justify-between">
                  <h3 className="p-2 text-sm font-medium">Subscribers</h3>
                  <h3 className="p-2 text-sm">
                    {summary.data?.pagination.total_count}
                  </h3>
                </div>
                <SubscriptionsChart
                  y="subscribers"
                  axisYOptions={{
                    ticks: 'month',
                    label: null,
                  }}
                  data={subscriptionStatistics.data.periods.map((d) => ({
                    ...d,
                    parsedStartDate: new Date(d.start_date),
                  }))}
                />
              </Card>
            )}
          </div>
        </div>
      </DashboardBody>
    </>
  )
}

export default ClientPage

const PostItem = (post: Article) => {
  const ref = useRef<HTMLAnchorElement>(null)
  const { org: currentOrg } = useCurrentOrgAndRepoFromURL()
  const isHovered = useHoverDirty(ref)

  const description = useMemo(() => post.body.split('. ')[0], [post])

  const image = post.body.match(/!\[.*?\]\((.*?)\)/)?.[1]

  return (
    <Link
      className="flex h-full flex-col overflow-hidden"
      ref={ref}
      href={`/maintainer/${currentOrg?.name}/posts/${post.slug}`}
    >
      <div className="dark:bg-polar-900 dark:border-polar-700 dark:hover:bg-polar-800 flex flex-row justify-between gap-x-8 rounded-3xl border border-gray-100 bg-white p-6 shadow-sm transition-colors hover:bg-gray-50">
        {image ? (
          <div
            className="flex min-h-0 w-28 flex-shrink-0 flex-col rounded-2xl bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${image})` }}
          />
        ) : (
          <div className="dark:bg-polar-700 flex min-h-0 w-28 flex-shrink-0 flex-col items-center justify-center rounded-2xl bg-gray-100 bg-cover bg-center bg-no-repeat">
            <PhotoIcon className="text-polar-400 h-8 w-8" />
          </div>
        )}
        <div className="flex min-w-0 flex-grow flex-col gap-y-6">
          <div className="flex w-full flex-col gap-y-2">
            <h3 className="text-md dark:text-polar-50 font-medium text-gray-950">
              {post.title}
            </h3>
            <p className="dark:text-polar-500 min-w-0 truncate text-gray-500">
              {description}
            </p>
          </div>
          <div className="flex flex-row items-center justify-between whitespace-nowrap">
            <div className="dark:text-polar-300  flex w-full flex-row flex-wrap gap-x-3 text-sm text-gray-500">
              {post.published_at &&
              new Date(post.published_at) <= new Date() ? (
                <PolarTimeAgo date={new Date(post.published_at)} />
              ) : (
                <>
                  {post.published_at ? (
                    <span>
                      {post.notify_subscribers
                        ? 'Publishing and sending in'
                        : 'Publising in'}{' '}
                      <PolarTimeAgo
                        date={new Date(post.published_at)}
                        suffix=""
                      />
                    </span>
                  ) : (
                    <span>Not scheduled</span>
                  )}
                </>
              )}
              &middot;
              {post.visibility !== 'public' ? (
                <div className="flex flex-row items-center gap-x-2 text-sm">
                  <span className="capitalize">{post.visibility}</span>
                </div>
              ) : (
                <div className="flex flex-row items-center gap-x-2 text-sm">
                  {post.paid_subscribers_only ? (
                    <>
                      <span className="text-green-500">$</span>
                      <span className="capitalize">Paid subscribers</span>
                    </>
                  ) : (
                    <>
                      <LanguageOutlined
                        className="text-blue-500"
                        fontSize="inherit"
                      />
                      <span className="capitalize">Public</span>
                    </>
                  )}
                </div>
              )}
              {post.web_view_count !== undefined ? (
                <>
                  &middot;
                  <div className="flex flex-row items-center gap-x-2 text-sm">
                    <EyeIcon className="h-4 w-4" />
                    <span>
                      {post.web_view_count}{' '}
                      {post.web_view_count === 1 ? 'view' : 'views'}
                    </span>
                  </div>
                </>
              ) : null}
              {post.email_sent_to_count ? (
                <>
                  &middot;
                  <div className="flex flex-row items-center gap-x-2 text-sm">
                    <EnvelopeIcon className="h-4 w-4" />
                    <span>
                      {post.email_sent_to_count}{' '}
                      {post.email_sent_to_count === 1
                        ? 'receiver'
                        : 'receivers'}
                    </span>
                  </div>
                </>
              ) : null}
            </div>

            <div className="hidden flex-row items-center gap-x-4 lg:flex">
              <AnimatedIconButton active={isHovered} variant="secondary">
                <ArrowForward fontSize="inherit" />
              </AnimatedIconButton>
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
