declare module '@json2csv/plainjs';

// faker only ships types for typescript >= 5 , this project is on 4.7
declare module '@faker-js/faker/locale/en' {
    export const faker: any;
}
