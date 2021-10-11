import {
  action,
  computed,
  IReactionDisposer,
  makeObservable,
  observable,
  reaction,
  runInAction
} from "mobx";
import { Ref } from "react";
import defined from "terriajs-cesium/Source/Core/defined";
import CesiumEvent from "terriajs-cesium/Source/Core/Event";
import addedByUser from "../Core/addedByUser";
import { Category, HelpAction } from "../Core/AnalyticEvents/analyticEvents";
import Result from "../Core/Result";
import triggerResize from "../Core/triggerResize";
import PickedFeatures from "../Map/PickedFeatures";
import CatalogMemberMixin, { getName } from "../ModelMixins/CatalogMemberMixin";
import GroupMixin from "../ModelMixins/GroupMixin";
import MappableMixin from "../ModelMixins/MappableMixin";
import ReferenceMixin from "../ModelMixins/ReferenceMixin";
import CommonStrata from "../Models/Definition/CommonStrata";
import { BaseModel } from "../Models/Definition/Model";
import getAncestors from "../Models/getAncestors";
import Terria from "../Models/Terria";
import { SATELLITE_HELP_PROMPT_KEY } from "../ReactViews/HelpScreens/SatelliteHelpPrompt";
import {
  defaultTourPoints,
  RelativePosition,
  TourPoint
} from "./defaultTourPoints";
import DisclaimerHandler from "./DisclaimerHandler";
import SearchState from "./SearchState";

export const DATA_CATALOG_NAME = "data-catalog";
export const USER_DATA_NAME = "my-data";

// check showWorkbenchButton delay and transforms
// export const WORKBENCH_RESIZE_ANIMATION_DURATION = 250;
export const WORKBENCH_RESIZE_ANIMATION_DURATION = 500;

interface ViewStateOptions {
  terria: Terria;
  catalogSearchProvider: any;
  locationSearchProviders: any[];
  errorHandlingProvider?: any;
}

/**
 * Root of a global view model. Presumably this should get nested as more stuff goes into it. Basically this belongs to
 * the root of the UI and then it can choose to pass either the whole thing or parts down as props to its children.
 */

export default class ViewState {
  readonly mobileViewOptions = Object.freeze({
    data: "data",
    preview: "preview",
    nowViewing: "nowViewing",
    locationSearchResults: "locationSearchResults"
  });
  readonly searchState: SearchState;
  readonly terria: Terria;
  readonly relativePosition = RelativePosition;

  @observable private _previewedItem: BaseModel | undefined;
  get previewedItem() {
    return this._previewedItem;
  }
  @observable userDataPreviewedItem: BaseModel | undefined;
  @observable explorerPanelIsVisible: boolean = false;
  @observable activeTabCategory: string = DATA_CATALOG_NAME;
  @observable activeTabIdInCategory: string | undefined = undefined;
  @observable isDraggingDroppingFile: boolean = false;
  @observable mobileView: string | null = null;
  @observable isMapFullScreen: boolean = false;
  @observable myDataIsUploadView: boolean = true;
  @observable mobileMenuVisible: boolean = false;
  @observable explorerPanelAnimating: boolean = false;
  @observable topElement: string = "FeatureInfo";
  @observable lastUploadedFiles: any[] = [];
  @observable storyBuilderShown: boolean = false;

  // Flesh out later
  @observable showHelpMenu: boolean = false;
  @observable showSatelliteGuidance: boolean = false;
  @observable showWelcomeMessage: boolean = false;
  @observable selectedHelpMenuItem: string = "";
  @observable helpPanelExpanded: boolean = false;
  @observable disclaimerSettings: any | undefined = undefined;
  @observable disclaimerVisible: boolean = false;
  @observable videoGuideVisible: string = "";

  @observable trainerBarVisible: boolean = false;
  @observable trainerBarExpanded: boolean = false;
  @observable trainerBarShowingAllSteps: boolean = false;
  @observable selectedTrainerItem: string = "";
  @observable currentTrainerItemIndex: number = 0;
  @observable currentTrainerStepIndex: number = 0;
  @action
  setSelectedTrainerItem(trainerItem: string) {
    this.selectedTrainerItem = trainerItem;
  }
  @action
  setTrainerBarVisible(bool: boolean) {
    this.trainerBarVisible = bool;
  }
  @action
  setTrainerBarShowingAllSteps(bool: boolean) {
    this.trainerBarShowingAllSteps = bool;
  }
  @action
  setTrainerBarExpanded(bool: boolean) {
    this.trainerBarExpanded = bool;
    // if collapsing trainer bar, also hide steps
    if (!bool) {
      this.trainerBarShowingAllSteps = bool;
    }
  }
  @action
  setCurrentTrainerItemIndex(index: number) {
    this.currentTrainerItemIndex = index;
    this.currentTrainerStepIndex = 0;
  }
  @action
  setCurrentTrainerStepIndex(index: number) {
    this.currentTrainerStepIndex = index;
  }

  /**
   * Bottom dock state & action
   */
  @observable bottomDockHeight: number = 0;
  @action
  setBottomDockHeight(height: number) {
    if (this.bottomDockHeight !== height) {
      this.bottomDockHeight = height;
    }
  }

  @observable workbenchWithOpenControls: string | undefined = undefined;

  errorProvider: any | null = null;

  // default value is null, because user has not made decision to show or
  // not show story
  // will be explicitly set to false when user 1. dismiss story
  // notification or 2. close a story
  @observable storyShown: boolean | null = null;

  @observable currentStoryId: number = 0;
  @observable featurePrompts: any[] = [];

  /**
   * we need a layering system for touring the app, but also a way for it to be
   * chopped and changed from a terriamap
   *
   * this will be slightly different to the help sequences that were done in
   * the past, but may evolve to become a "sequence" (where the UI gets
   * programatically toggled to delve deeper into the app, e.g. show the user
   * how to add data via the data catalog window)
   *
   * rough points
   * - "all guide points visible"
   * -
   *

   * draft structure(?):
   *
   * maybe each "guide" item will have
   * {
   *  ref: (react ref object)
   *  dotOffset: (which way the dot and guide should be positioned relative to the ref component)
   *  content: (component, more flexibility than a string)
   * ...?
   * }
   * and guide props?
   * {
   *  enabled: parent component to decide this based on active index
   * ...?
   * }
   *  */

  @observable tourPoints: TourPoint[] = defaultTourPoints;
  @observable showTour: boolean = false;
  @observable appRefs: Map<string, Ref<HTMLElement>> = new Map();
  @observable currentTourIndex: number = -1;
  @observable showCollapsedNavigation: boolean = false;

  get tourPointsWithValidRefs() {
    // should viewstate.ts reach into document? seems unavoidable if we want
    // this to be the true source of tourPoints.
    // update: well it turns out you can be smarter about it and actually
    // properly clean up your refs - so we'll leave that up to the UI to
    // provide valid refs
    return this.tourPoints
      .sort((a, b) => {
        return a.priority - b.priority;
      })
      .filter(
        tourPoint => (<any>this.appRefs).get(tourPoint.appRefName)?.current
      );
  }
  @action
  setTourIndex(index: number) {
    this.currentTourIndex = index;
  }
  @action
  setShowTour(bool: boolean) {
    this.showTour = bool;
    // If we're enabling the tour, make sure the trainer is collapsed
    if (bool) {
      this.setTrainerBarExpanded(false);
    }
  }
  @action
  closeTour() {
    this.currentTourIndex = -1;
    this.showTour = false;
  }
  @action
  previousTourPoint() {
    const currentIndex = this.currentTourIndex;
    if (currentIndex !== 0) {
      this.currentTourIndex = currentIndex - 1;
    }
  }
  @action
  nextTourPoint() {
    const totalTourPoints = this.tourPointsWithValidRefs.length;
    const currentIndex = this.currentTourIndex;
    if (currentIndex >= totalTourPoints - 1) {
      this.closeTour();
    } else {
      this.currentTourIndex = currentIndex + 1;
    }
  }
  @action
  closeCollapsedNavigation() {
    this.showCollapsedNavigation = false;
  }

  @action
  updateAppRef(refName: string, ref: Ref<HTMLElement>) {
    if (!this.appRefs.get(refName) || this.appRefs.get(refName) !== ref) {
      this.appRefs.set(refName, ref);
    }
  }
  @action
  deleteAppRef(refName: string) {
    this.appRefs.delete(refName);
  }

  /**
   * Gets or sets a value indicating whether the small screen (mobile) user interface should be used.
   * @type {Boolean}
   */
  @observable useSmallScreenInterface: boolean = false;

  /**
   * Gets or sets a value indicating whether the feature info panel is visible.
   * @type {Boolean}
   */
  @observable featureInfoPanelIsVisible: boolean = false;

  /**
   * Gets or sets a value indicating whether the feature info panel is collapsed.
   * When it's collapsed, only the title bar is visible.
   * @type {Boolean}
   */
  @observable featureInfoPanelIsCollapsed: boolean = false;

  /**
   * True if this is (or will be) the first time the user has added data to the map.
   * @type {Boolean}
   */
  @observable firstTimeAddingData: boolean = true;

  /**
   * Gets or sets a value indicating whether the feedback form is visible.
   * @type {Boolean}
   */
  @observable feedbackFormIsVisible: boolean = false;

  /**
   * Gets or sets a value indicating whether the catalog's model share panel
   * is currently visible.
   */
  @observable shareModelIsVisible: boolean = false;

  /**
   * The currently open tool
   */
  @observable currentTool?: Tool;

  @observable panel: React.ReactNode;

  private _unsubscribeErrorListener: CesiumEvent.RemoveCallback;
  private _pickedFeaturesSubscription: IReactionDisposer;
  private _disclaimerVisibleSubscription: IReactionDisposer;
  private _isMapFullScreenSubscription: IReactionDisposer;
  private _showStoriesSubscription: IReactionDisposer;
  private _mobileMenuSubscription: IReactionDisposer;
  private _storyPromptSubscription: IReactionDisposer;
  private _previewedItemIdSubscription: IReactionDisposer;
  private _workbenchHasTimeWMSSubscription: IReactionDisposer;
  private _storyBeforeUnloadSubscription: IReactionDisposer;
  private _disclaimerHandler: DisclaimerHandler;

  constructor(options: ViewStateOptions) {
    const terria = options.terria;
    this.searchState = new SearchState({
      terria: terria,
      catalogSearchProvider: options.catalogSearchProvider,
      locationSearchProviders: options.locationSearchProviders
    });

    this.errorProvider = options.errorHandlingProvider
      ? options.errorHandlingProvider
      : null;
    this.terria = terria;

    // Show errors to the user as notifications.
    this._unsubscribeErrorListener = terria.addErrorEventListener(error =>
      terria.notificationState.addNotificationToQueue(error.toNotification())
    );

    // When features are picked, show the feature info panel.
    this._pickedFeaturesSubscription = reaction(
      () => this.terria.pickedFeatures,
      (pickedFeatures: PickedFeatures | undefined) => {
        if (defined(pickedFeatures)) {
          this.featureInfoPanelIsVisible = true;
          this.featureInfoPanelIsCollapsed = false;
        } else {
          this.featureInfoPanelIsVisible = false;
        }
      }
    );
    // When disclaimer is shown, ensure fullscreen
    // unsure about this behaviour because it nudges the user off center
    // of the original camera set from config once they acknowdge
    this._disclaimerVisibleSubscription = reaction(
      () => this.disclaimerVisible,
      disclaimerVisible => {
        if (disclaimerVisible) {
          this.isMapFullScreen = true;
        } else if (!disclaimerVisible && this.isMapFullScreen) {
          this.isMapFullScreen = false;
        }
      }
    );

    this._isMapFullScreenSubscription = reaction(
      () =>
        terria.userProperties.get("hideWorkbench") === "1" ||
        terria.userProperties.get("hideExplorerPanel") === "1",
      (isMapFullScreen: boolean) => {
        this.isMapFullScreen = isMapFullScreen;

        // if /#hideWorkbench=1 exists in url onload, show stories directly
        // any show/hide workbench will not automatically show story
        if (!defined(this.storyShown)) {
          // why only checkk config params here? because terria.stories are not
          // set at the moment, and that property will be checked in rendering
          // Here are all are checking are: is terria story enabled in this app?
          // if so we should show it when app first laod, if workbench is hiddne
          this.storyShown = terria.configParameters.storyEnabled;
        }
      }
    );

    this._showStoriesSubscription = reaction(
      () => Boolean(terria.userProperties.get("playStory")),
      (playStory: boolean) => {
        this.storyShown = terria.configParameters.storyEnabled && playStory;
      }
    );

    this._mobileMenuSubscription = reaction(
      () => this.mobileMenuVisible,
      (mobileMenuVisible: boolean) => {
        if (mobileMenuVisible) {
          this.explorerPanelIsVisible = false;
          this.switchMobileView(null);
        }
      }
    );

    this._disclaimerHandler = new DisclaimerHandler(terria, this);

    this._workbenchHasTimeWMSSubscription = reaction(
      () => this.terria.workbench.hasTimeWMS,
      (hasTimeWMS: boolean) => {
        if (
          this.terria.configParameters.showInAppGuides &&
          hasTimeWMS === true &&
          // // only show it once
          !this.terria.getLocalProperty(`${SATELLITE_HELP_PROMPT_KEY}Prompted`)
        ) {
          this.setShowSatelliteGuidance(true);
          this.toggleFeaturePrompt(SATELLITE_HELP_PROMPT_KEY, true, true);
        }
      }
    );

    this._storyPromptSubscription = reaction(
      () => this.storyShown,
      (storyShown: boolean | null) => {
        if (storyShown === false) {
          // only show it once
          if (!this.terria.getLocalProperty("storyPrompted")) {
            this.toggleFeaturePrompt("story", true, false);
          }
        }
      }
    );

    this._previewedItemIdSubscription = reaction(
      () => this.terria.previewedItemId,
      (previewedItemId: string | undefined) => {
        if (previewedItemId === undefined) {
          return;
        }

        const model = this.terria.getModelById(BaseModel, previewedItemId);
        if (model !== undefined) {
          this.viewCatalogMember(model);
        }
      }
    );

    const handleWindowClose = (e: BeforeUnloadEvent) => {
      // Cancel the event
      e.preventDefault(); // If you prevent default behavior in Mozilla Firefox prompt will always be shown
      // Chrome requires returnValue to be set
      e.returnValue = "";
    };

    this._storyBeforeUnloadSubscription = reaction(
      () => this.terria.stories.length > 0,
      hasScenes => {
        if (hasScenes) {
          window.addEventListener("beforeunload", handleWindowClose);
        } else {
          window.removeEventListener("beforeunload", handleWindowClose);
        }
      }
    );

    makeObservable(this);
  }

  dispose() {
    this._pickedFeaturesSubscription();
    this._disclaimerVisibleSubscription();
    this._unsubscribeErrorListener();
    this._mobileMenuSubscription();
    this._isMapFullScreenSubscription();
    this._showStoriesSubscription();
    this._storyPromptSubscription();
    this._previewedItemIdSubscription();
    this._workbenchHasTimeWMSSubscription();
    this._disclaimerHandler.dispose();
    this.searchState.dispose();
  }

  @action
  triggerResizeEvent() {
    triggerResize();
  }

  @action
  setIsMapFullScreen(
    bool: boolean,
    animationDuration = WORKBENCH_RESIZE_ANIMATION_DURATION
  ) {
    this.isMapFullScreen = bool;
    // Allow any animations to finish, then trigger a resize.

    // (wing): much better to do by listening for transitionend, but will leave
    // this as is until that's in place
    setTimeout(function() {
      // should we do this here in viewstate? it pulls in browser dependent things,
      // and (defensively) calls it.
      // but only way to ensure we trigger this resize, by standardising fullscreen
      // toggle through an action.
      triggerResize();
    }, animationDuration);
  }

  @action
  toggleStoryBuilder() {
    this.storyBuilderShown = !this.storyBuilderShown;
  }

  @action
  setTopElement(key: string) {
    this.topElement = key;
  }

  @action
  openAddData() {
    this.explorerPanelIsVisible = true;
    this.activeTabCategory = DATA_CATALOG_NAME;
    this.switchMobileView(this.mobileViewOptions.data);
  }

  @action
  openUserData() {
    this.explorerPanelIsVisible = true;
    this.activeTabCategory = USER_DATA_NAME;
  }

  @action
  closeCatalog() {
    this.explorerPanelIsVisible = false;
    this.switchMobileView(null);
    this.clearPreviewedItem();
  }

  @action
  searchInCatalog(query: string) {
    this.openAddData();
    this.searchState.catalogSearchText = query;
    this.searchState.searchCatalog();
  }

  @action
  clearPreviewedItem() {
    this.userDataPreviewedItem = undefined;
    this._previewedItem = undefined;
  }

  /**
   * Views a model in the catalog. If model is a
   *
   * - `Reference` - it will be dereferenced first.
   * - `CatalogMember` - `loadMetadata` will be called
   * - `Group` - its `isOpen` trait will be set according to the value of the `isOpen` parameter in the `stratum` indicated.
   *   - If after doing this the group is open, its members will be loaded with a call to `loadMembers`.
   * - `Mappable` - `loadMapItems` will be called
   *
   * Then (if no errors have occurred) it will open the catalog.
   * Note - `previewItem` is set at the start of the function, regardless of errors.
   *
   * @param item The model to view in catalog.
   * @param [isOpen=true] True if the group should be opened. False if it should be closed.
   * @param stratum The stratum in which to mark the group opened or closed.
   * @param openAddData True if data catalog window should be opened.
   */
  async viewCatalogMember(
    item: BaseModel,
    isOpen: boolean = true,
    stratum: string = CommonStrata.user,
    openAddData = true
  ): Promise<Result<void>> {
    try {
      // Set preview item
      runInAction(() => (this._previewedItem = item));

      // Open "Add Data"
      if (openAddData) {
        if (addedByUser(item)) {
          runInAction(() => (this.userDataPreviewedItem = item));

          this.openUserData();
        } else {
          runInAction(() => {
            this.openAddData();
            if (this.terria.configParameters.tabbedCatalog) {
              const parentGroups = getAncestors(item);
              if (parentGroups.length > 0) {
                // Go to specific tab
                this.activeTabIdInCategory = parentGroups[0].uniqueId;
              }
            }
          });
        }

        // mobile switch to nowvewing if not viewing a group
        if (!GroupMixin.isMixedInto(item)) {
          this.switchMobileView(this.mobileViewOptions.preview);
        }
      }

      // Load preview item
      if (ReferenceMixin.isMixedInto(item)) {
        (await item.loadReference()).throwIfError();

        // call viewCatalogMember on reference.target
        if (item.target) {
          return await this.viewCatalogMember(item.target, isOpen, stratum);
        }
        return Result.error(`Failed to resolve reference for ${getName(item)}`);
      }

      if (GroupMixin.isMixedInto(item)) {
        item.setTrait(stratum, "isOpen", isOpen);
        if (item.isOpen) {
          (await item.loadMembers()).throwIfError();
        }
      } else if (MappableMixin.isMixedInto(item))
        (await item.loadMapItems()).throwIfError();
      else if (CatalogMemberMixin.isMixedInto(item))
        (await item.loadMetadata()).throwIfError();
    } catch (e) {
      return Result.error(e, `Could not view catalog member ${getName(item)}`);
    }
    return Result.none();
  }

  @action
  switchMobileView(viewName: string | null) {
    this.mobileView = viewName;
  }

  @action
  showHelpPanel() {
    this.terria.analytics?.logEvent(Category.help, HelpAction.panelOpened);
    this.showHelpMenu = true;
    this.helpPanelExpanded = false;
    this.selectedHelpMenuItem = "";
    this.setTopElement("HelpPanel");
  }

  @action
  selectHelpMenuItem(key: string) {
    this.selectedHelpMenuItem = key;
    this.helpPanelExpanded = true;
  }

  @action
  hideHelpPanel() {
    this.showHelpMenu = false;
  }

  @action
  changeSearchState(newText: string) {
    this.searchState.catalogSearchText = newText;
  }

  @action
  setDisclaimerVisible(bool: boolean) {
    this.disclaimerVisible = bool;
  }

  @action
  hideDisclaimer() {
    this.setDisclaimerVisible(false);
  }

  @action
  setShowSatelliteGuidance(showSatelliteGuidance: boolean) {
    this.showSatelliteGuidance = showSatelliteGuidance;
  }

  @action
  setShowWelcomeMessage(welcomeMessageShown: boolean) {
    this.showWelcomeMessage = welcomeMessageShown;
  }

  @action
  setVideoGuideVisible(videoName: string) {
    this.videoGuideVisible = videoName;
  }

  /**
   * Removes references of a model from viewState
   */
  @action
  removeModelReferences(model: BaseModel) {
    if (this._previewedItem === model) this._previewedItem = undefined;
    if (this.userDataPreviewedItem === model)
      this.userDataPreviewedItem = undefined;
  }

  @action
  toggleFeaturePrompt(
    feature: string,
    state: boolean,
    persistent: boolean = false
  ) {
    const featureIndexInPrompts = this.featurePrompts.indexOf(feature);
    if (
      state &&
      featureIndexInPrompts < 0 &&
      !this.terria.getLocalProperty(`${feature}Prompted`)
    ) {
      this.featurePrompts.push(feature);
    } else if (!state && featureIndexInPrompts >= 0) {
      this.featurePrompts.splice(featureIndexInPrompts, 1);
    }
    if (persistent) {
      this.terria.setLocalProperty(`${feature}Prompted`, true);
    }
  }

  viewingUserData() {
    return this.activeTabCategory === USER_DATA_NAME;
  }

  afterTerriaStarted() {
    if (this.terria.configParameters.openAddData) {
      this.openAddData();
    }
  }

  @action
  openTool(tool: Tool) {
    this.currentTool = tool;
  }

  @action
  closeTool() {
    this.currentTool = undefined;
  }

  @action
  toggleMobileMenu() {
    this.setTopElement("mobileMenu");
    this.mobileMenuVisible = !this.mobileMenuVisible;
  }

  @computed
  get breadcrumbsShown() {
    return (
      this.previewedItem !== undefined ||
      this.userDataPreviewedItem !== undefined
    );
  }

  @computed
  get isToolOpen() {
    return this.currentTool !== undefined;
  }

  @computed
  get hideMapUi() {
    return (
      this.terria.notificationState.currentNotification !== undefined &&
      this.terria.notificationState.currentNotification!.hideUi
    );
  }

  get isMapZooming() {
    return this.terria.currentViewer.isMapZooming;
  }

  /**
   * Returns true if the user is currently interacting with the map - like
   * picking a point or drawing a shape.
   */
  @computed
  get isMapInteractionActive() {
    return this.terria.mapInteractionModeStack.length > 0;
  }
}

interface Tool {
  toolName: string;
  getToolComponent: () => React.ComponentType | Promise<React.ComponentType>;

  showCloseButton: boolean;
  params?: any;
}
