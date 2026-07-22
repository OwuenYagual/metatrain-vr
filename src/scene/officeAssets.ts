export const OFFICE_MODEL_PATHS = {
    bookcase: '/models/office/bookcaseOpen.glb',
    books: '/models/office/books.glb',
    deskChair: '/models/office/chairDesk.glb',
    keyboard: '/models/office/computerKeyboard.glb',
    monitor: '/models/office/computerScreen.glb',
    desk: '/models/office/desk.glb',
    floorLamp: '/models/office/lampRoundFloor.glb',
    laptop: '/models/office/laptop.glb',
    loungeChair: '/models/office/loungeDesignChair.glb',
    loungeSofa: '/models/office/loungeSofaLong.glb',
    smallPlant: '/models/office/plantSmall1.glb',
    pottedPlant: '/models/office/pottedPlant.glb',
    rug: '/models/office/rugRectangle.glb',
    coffeeTable: '/models/office/tableCoffee.glb',
    display: '/models/office/televisionModern.glb',
} as const;

export type OfficeModelPath = (typeof OFFICE_MODEL_PATHS)[keyof typeof OFFICE_MODEL_PATHS];

export const OFFICE_MODEL_PATH_LIST = Object.values(OFFICE_MODEL_PATHS);
