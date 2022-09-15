import DataTable from './main-table/MainTable';
import SideNav from './side-nav/SideNav';

export function TablePage() {
    return (
        <div>
            <SideNav
                tables={[
                    { Name: 'people', Type: 'table' },
                    { Name: 'order', Type: 'view' },
                    { Name: 'clients', Type: 'table' },
                    { Name: 'office', Type: 'table' },
                    { Name: 'order_service', Type: 'table' },
                    { Name: 'events', Type: 'table' },
                    { Name: 'event_service', Type: 'table' },
                    { Name: 'translation_service', Type: 'table' },
                    { Name: 'user_guides', Type: 'table' },
                    { Name: 'read_mes', Type: 'table' },
                ]}
            >
                <DataTable></DataTable>
            </SideNav>
        </div>
    );
}
