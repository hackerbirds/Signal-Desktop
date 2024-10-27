// Copyright 2019 Signal Messenger, LLC
// SPDX-License-Identifier: AGPL-3.0-only

import * as React from 'react';
import classNames from 'classnames';
import FocusTrap from 'focus-trap-react';
import { List } from 'react-virtualized';

import { useRestoreFocus } from '../../hooks/useRestoreFocus';
import type { StickerPackType, StickerType } from '../../state/ducks/stickers';
import type { LocalizerType } from '../../types/Util';
import { getAnalogTime } from '../../util/getAnalogTime';
import { getDateTimeFormatter } from '../../util/formatTimestamp';

export type OwnProps = {
  readonly i18n: LocalizerType;
  readonly onClose: () => unknown;
  readonly onClickAddPack?: () => unknown;
  readonly onPickSticker: (
    packId: string,
    stickerId: number,
    url: string
  ) => unknown;
  readonly onPickTimeSticker?: (style: 'analog' | 'digital') => unknown;
  readonly packs: ReadonlyArray<StickerPackType>;
  readonly recentStickers: ReadonlyArray<StickerType>;
  readonly showPickerHint?: boolean;
};

export type Props = OwnProps & Pick<React.HTMLProps<HTMLDivElement>, 'style'>;

const PACKS_PAGE_SIZE = 7;
const PACK_ICON_WIDTH = 32;
const PACK_PAGE_WIDTH = PACKS_PAGE_SIZE * PACK_ICON_WIDTH;

const STICKER_HEIGHT = 68;
// 20 in height + 5 in margin-top + 5 in margin-bottom
const RECENTS_HEADER_HEIGHT = 20 + 5 + 5;
const SHOW_TEXT_HEIGHT = 30;
const SHOW_LONG_TEXT_HEIGHT = 60;
// 40 in height + 5 in margin-bottom
const PACK_NAME_HEIGHT = 40 + 5;
const FEATURED_STICKERS_HEIGHT = RECENTS_HEADER_HEIGHT + STICKER_HEIGHT + 20; // margin-bottom

function getPacksPageOffset(page: number, packs: number): number {
  if (page === 0) {
    return 0;
  }

  if (isLastPacksPage(page, packs)) {
    return (
      PACK_PAGE_WIDTH * (Math.floor(packs / PACKS_PAGE_SIZE) - 1) +
      ((packs % PACKS_PAGE_SIZE) - 1) * PACK_ICON_WIDTH
    );
  }

  return page * PACK_ICON_WIDTH * PACKS_PAGE_SIZE;
}

function isLastPacksPage(page: number, packs: number): boolean {
  return page === Math.floor(packs / PACKS_PAGE_SIZE);
}

export const StickerPicker = React.memo(
  React.forwardRef<HTMLDivElement, Props>(
    (
      {
        i18n,
        packs,
        recentStickers,
        onClose,
        onClickAddPack,
        onPickSticker,
        onPickTimeSticker,
        showPickerHint,
        style,
      }: Props,
      ref
    ) => {
      // The index of the pack we're browsing (whether by
      // scrolling to it, or clicking on it) on the virtualized list.
      // 0 is the index for recent stickers.
      const [selectedPackIndex, setSelectedPackIndex] = React.useState(0);

      const isRTL = i18n.getLocaleDirection() === 'rtl';

      const [isUsingKeyboard, setIsUsingKeyboard] = React.useState(false);
      const [packsPage, setPacksPage] = React.useState(0);
      const onClickPrevPackPage = React.useCallback(() => {
        setPacksPage(i => i - 1);
      }, [setPacksPage]);
      const onClickNextPackPage = React.useCallback(() => {
        setPacksPage(i => i + 1);
      }, [setPacksPage]);

      const packInfo = React.useCallback((pack: StickerPackType) => {
        const pendingCount =
          pack && pack.status === 'pending'
            ? pack.stickerCount - pack.stickers.length
            : 0;

        const hasDownloadError =
          pack &&
          pack.status === 'error' &&
          pack.stickerCount !== pack.stickers.length;

        const showPendingText = pendingCount > 0;
        const showEmptyText = pack && !hasDownloadError && pack.stickerCount === 0;
        const showText = showPendingText || hasDownloadError || showEmptyText;

        return [
          showText,
          showPendingText,
          pendingCount,
          showEmptyText,
          hasDownloadError,
        ];
      }, []);

      const hasPacks = packs.length > 0;
      const hasRecents = recentStickers.length > 0;
      const isRecentsSelected = hasPacks && selectedPackIndex === 0;

      const hasTimeStickers = isRecentsSelected && onPickTimeSticker;
      const isEmpty =
        !hasPacks && !hasTimeStickers && recentStickers.length === 0;

      const rowHeight = React.useCallback(
        ({ index }: { index: number }) => {
          const isRecents = index === 0;
          const stickerCount = isRecents
            ? recentStickers.length
            : packs[index - 1].stickerCount;

          const [showText] = packInfo(packs[index - 1]);

          const rows = Math.ceil(stickerCount / 4);

          // Extra height can be needed to render pending downloads or errors
          const showTextHeight = !isRecents && showText ? SHOW_TEXT_HEIGHT : 0;

          const showHintHeight =
            isRecents && showPickerHint ? SHOW_LONG_TEXT_HEIGHT : 0;

          const recentStickersHeaderHeight =
            (hasRecents ? RECENTS_HEADER_HEIGHT : 0) +
            (hasTimeStickers ? FEATURED_STICKERS_HEIGHT : 0) +
            showHintHeight;

          const packHeaderHeight = isRecents
            ? recentStickersHeaderHeight
            : PACK_NAME_HEIGHT;

          const packGridHeight = STICKER_HEIGHT * rows;
          // We have to consider 8px padding in between each row
          // And the 20px margin-bottom
          const packGridPadding = 8 * (rows - 1) + 20;
          return (
            packHeaderHeight + showTextHeight + packGridHeight + packGridPadding
          );
        },
        [
          recentStickers,
          packs,
          showPickerHint,
          hasRecents,
          hasTimeStickers,
          packInfo,
        ]
      );

      // Handle escape key
      React.useEffect(() => {
        const handler = (event: KeyboardEvent) => {
          if (event.key === 'Tab') {
            // We do NOT prevent default here to allow Tab to be used normally

            setIsUsingKeyboard(true);

            return;
          }

          if (event.key === 'Escape') {
            event.stopPropagation();
            event.preventDefault();

            onClose();
          }
        };

        document.addEventListener('keydown', handler);

        return () => {
          document.removeEventListener('keydown', handler);
        };
      }, [onClose]);

      // Focus popup on after initial render, restore focus on teardown
      const [focusRef] = useRestoreFocus();

      const addPackRef = isEmpty ? focusRef : undefined;

      const listRef = React.createRef<List>();

      const rowRenderer = React.useCallback(
        ({
          index,
          key,
          style: listStyle,
        }: {
          index: number;
          key: string;
          style: React.CSSProperties;
        }) => {
          const analogTime = getAnalogTime();

          const renderedStickers = (
            stickerList: ReadonlyArray<StickerType>
          ) => {
            return stickerList.map(sticker => (
              <button
                type="button"
                key={`${key}-${sticker.packId}-${sticker.id}`}
                className="module-sticker-picker__body__cell"
                onClick={() =>
                  onPickSticker(sticker.packId, sticker.id, sticker.url)
                }
              >
                <img
                  className="module-sticker-picker__body__cell__image"
                  src={sticker.url}
                  alt={sticker.emoji}
                />
              </button>
            ));
          };

          // Recents and/or featured stickers are at special index 0.
          if (index === 0) {
            const featuredStickerElement = hasTimeStickers && (
              <div className="module-sticker-picker__featured">
                <h3 className="module-sticker-picker__featured--title">
                  {i18n('icu:stickers__StickerPicker__featured')}
                </h3>
                <div className="module-sticker-picker__body__grid">
                  <button
                    type="button"
                    className="module-sticker-picker__body__cell module-sticker-picker__time--digital"
                    onClick={() => onPickTimeSticker('digital')}
                  >
                    {getDateTimeFormatter({
                      hour: 'numeric',
                      minute: 'numeric',
                    })
                      .formatToParts(Date.now())
                      .filter(x => x.type !== 'dayPeriod')
                      .reduce((acc, { value }) => `${acc}${value}`, '')}
                  </button>

                  <button
                    aria-label={i18n(
                      'icu:stickers__StickerPicker__analog-time'
                    )}
                    className="module-sticker-picker__body__cell module-sticker-picker__time--analog"
                    onClick={() => onPickTimeSticker('analog')}
                    type="button"
                  >
                    <span
                      className="module-sticker-picker__time--analog__hour"
                      style={{
                        transform: `rotate(${analogTime.hour}deg)`,
                      }}
                    />
                    <span
                      className="module-sticker-picker__time--analog__minute"
                      style={{
                        transform: `rotate(${analogTime.minute}deg)`,
                      }}
                    />
                  </button>
                </div>
              </div>
            );

            const recentStickersElement = hasRecents && (
              <>
                <div
                  className={classNames(
                    'module-sticker-picker__pack-name',
                    'module-sticker-picker__pack-name__recents'
                  )}
                >
                  <h3>{i18n('icu:stickers__StickerPicker__recent')}</h3>
                </div>
                <div className="module-sticker-picker__body__grid">
                  {renderedStickers(recentStickers)}
                </div>
              </>
            );

            return (
              <div key={key} style={listStyle}>
                {showPickerHint ? (
                  <div
                    className={classNames(
                      'module-sticker-picker__body__text',
                      'module-sticker-picker__body__text--hint'
                    )}
                  >
                    {i18n('icu:stickers--StickerPicker--Hint')}
                  </div>
                ) : null}
                {featuredStickerElement}
                {recentStickersElement}
              </div>
            );
          }

          const selectedPack = packs[index - 1];
          const [
            ,
            pendingCount,
            showPendingText,
            showEmptyText,
            hasDownloadError,
          ] = packInfo(selectedPack);

          return (
            <div key={key} style={listStyle}>
              <div className="module-sticker-picker__pack-name">
                <h3>{selectedPack.title}</h3>
                <i>{selectedPack.author}</i>
              </div>
              {showPendingText ? (
                <div className="module-sticker-picker__body__text">
                  {i18n('icu:stickers--StickerPicker--DownloadPending')}
                </div>
              ) : null}
              {hasDownloadError && selectedPack.stickers.length > 0 ? (
                <div
                  className={classNames(
                    'module-sticker-picker__body__text',
                    'module-sticker-picker__body__text--error'
                  )}
                >
                  {i18n('icu:stickers--StickerPicker--DownloadError')}
                </div>
              ) : null}
              {hasPacks && showEmptyText ? (
                <div
                  className={classNames('module-sticker-picker__body__text', {
                    'module-sticker-picker__body__text--error':
                      !isRecentsSelected,
                  })}
                >
                  {i18n('icu:stickers--StickerPicker--Empty')}
                </div>
              ) : null}
              <div className="module-sticker-picker__body__grid">
                {renderedStickers(selectedPack.stickers)}
                {Array(pendingCount)
                  .fill(0)
                  .map((_, i) => (
                    <div
                      // eslint-disable-next-line react/no-array-index-key
                      key={i}
                      className="module-sticker-picker__body__cell__placeholder"
                      role="presentation"
                    />
                  ))}
              </div>
            </div>
          );
        },
        [
          recentStickers,
          packs,
          showPickerHint,
          hasPacks,
          hasRecents,
          hasTimeStickers,
          isRecentsSelected,
          i18n,
          onPickSticker,
          onPickTimeSticker,
          packInfo,
        ]
      );

      const onRowsRendered = ({ startIndex }: { startIndex: number }) => {
        if (startIndex > 0 && selectedPackIndex > 0) {
          // If we're on a new page, we're on a new multiple of PACKS_PAGE_SIZE
          // (because there are PACKS_PAGE_SIZE stickers per page)
          // The indexes have an offset of one because the recent stickers start at 0,
          // so packs start at 1
          const newPage = Math.floor((startIndex - 1) / PACKS_PAGE_SIZE);
          const oldPage = Math.floor((selectedPackIndex - 1) / PACKS_PAGE_SIZE);
          const pageDiff = newPage - oldPage;
          // If:
          // 1) The page we're on is not the page we're supposed to be
          // or 2) we're scrolling up to a new page
          // or 3) we're scrolling down to a previous page
          // then we update the page we're on
          if (
            packsPage !== newPage ||
            (pageDiff > 0 && !isLastPacksPage(packsPage, packs.length)) ||
            (pageDiff < 0 && packsPage > 0)
          ) {
            setPacksPage(newPage);
          }
        }
        setSelectedPackIndex(startIndex);
      };

      const noRowsElement = React.useCallback(() => {
        return (
          <div className="module-sticker-picker__body__text">
            {i18n('icu:stickers--StickerPicker--NoPacks')}
          </div>
        );
      }, [i18n]);

      return (
        <FocusTrap
          focusTrapOptions={{
            allowOutsideClick: true,
          }}
        >
          <div className="module-sticker-picker" ref={ref} style={style}>
            <div className="module-sticker-picker__header">
              <div className="module-sticker-picker__header__packs">
                <div
                  className="module-sticker-picker__header__packs__slider"
                  style={{
                    transform: `translateX(${isRTL ? '' : '-'}${getPacksPageOffset(
                      packsPage,
                      packs.length
                    )}px)`,
                  }}
                >
                  <button
                    aria-pressed={isRecentsSelected}
                    type="button"
                    onClick={() => {
                      listRef.current?.scrollToRow(0);
                    }}
                    className={classNames({
                      'module-sticker-picker__header__button': true,
                      'module-sticker-picker__header__button--recents': true,
                      'module-sticker-picker__header__button--selected':
                        isRecentsSelected,
                    })}
                    aria-label={i18n('icu:stickers--StickerPicker--Recents')}
                  />
                  {packs.map((pack, i) => (
                    <button
                      aria-pressed={selectedPackIndex === i + 1}
                      type="button"
                      key={pack.id}
                      onClick={() => {
                        // scrollToRow has floating point issues so onRowRendered
                        // can end up returning the wrong rows if the user has fractional
                        // scaling or app zoom (ask how I know...)
                        //
                        // So we add an epsilon value to the computed row position and
                        // scroll that amount instead. 1 pixel extra is invisible and
                        // ensures the problem goes away for good
                        if (listRef.current) {
                          const positionEpsilon = 1.0;

                          const packPosition =
                            listRef.current.getOffsetForRow({
                              alignment: 'start',
                              // Since recent stickers at at row 0,
                              // we have to offset by 1
                              index: i + 1,
                            }) + positionEpsilon;

                          listRef.current.scrollToPosition(packPosition);
                        }
                      }}
                      className={classNames(
                        'module-sticker-picker__header__button',
                        {
                          'module-sticker-picker__header__button--selected':
                            selectedPackIndex === i + 1,
                          'module-sticker-picker__header__button--error':
                            pack.status === 'error',
                        }
                      )}
                    >
                      {pack.cover ? (
                        <img
                          className="module-sticker-picker__header__button__image"
                          src={pack.cover.url}
                          alt={pack.title}
                          title={pack.title}
                        />
                      ) : (
                        <div className="module-sticker-picker__header__button__image-placeholder" />
                      )}
                    </button>
                  ))}
                </div>
                {!isUsingKeyboard && packsPage > 0 ? (
                  <button
                    type="button"
                    className={classNames(
                      'module-sticker-picker__header__button',
                      'module-sticker-picker__header__button--prev-page'
                    )}
                    onClick={onClickPrevPackPage}
                    aria-label={i18n('icu:stickers--StickerPicker--PrevPage')}
                  />
                ) : null}
                {!isUsingKeyboard &&
                !isLastPacksPage(packsPage, packs.length) ? (
                  <button
                    type="button"
                    className={classNames(
                      'module-sticker-picker__header__button',
                      'module-sticker-picker__header__button--next-page'
                    )}
                    onClick={onClickNextPackPage}
                    aria-label={i18n('icu:stickers--StickerPicker--NextPage')}
                  />
                ) : null}
              </div>
              {onClickAddPack && (
                <button
                  type="button"
                  ref={addPackRef}
                  className={classNames(
                    'module-sticker-picker__header__button',
                    'module-sticker-picker__header__button--add-pack',
                    {
                      'module-sticker-picker__header__button--hint':
                        showPickerHint,
                    }
                  )}
                  onClick={onClickAddPack}
                  aria-label={i18n('icu:stickers--StickerPicker--AddPack')}
                />
              )}
            </div>
            <div
              className={classNames('module-sticker-picker__body', {
                'module-sticker-picker__body--empty': isEmpty,
              })}
            >
              <div className="module-sticker-picker__body__content">
                <List
                  width={316}
                  height={344}
                  ref={listRef}
                  style={{
                    direction: isRTL ? 'rtl' : 'ltr',
                  }}
                  scrollToAlignment="start"
                  noRowsRenderer={noRowsElement}
                  rowCount={isEmpty ? 0 : packs.length + ((hasRecents || hasTimeStickers) ? 1 : 0)}
                  rowHeight={rowHeight}
                  rowRenderer={rowRenderer}
                  overscanRowCount={0}
                  onRowsRendered={onRowsRendered}
                />
              </div>
            </div>
          </div>
        </FocusTrap>
      );
    }
  )
);
